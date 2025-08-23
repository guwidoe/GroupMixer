import React, { useState, useRef } from 'react';
import { useAppStore } from '../store';
import { Play, Pause, RotateCcw, Settings, TrendingUp, Clock, Activity, ChevronDown, ChevronRight, Info, BarChart3 } from 'lucide-react';
import type { SolverSettings, Problem } from '../types';
import { solverWorkerService } from '../services/solverWorker';
import { wasmService } from '../services/wasm';
import type { ProgressUpdate } from '../services/wasm';
import { Tooltip } from './Tooltip';
import { problemStorage } from '../services/problemStorage';

export function SolverPanel() {
  const { solverState, startSolver, stopSolver, resetSolver, setSolverState, setSolution, addNotification, addResult, updateProblem, ensureProblemExists } = useAppStore();
  
  // Get the current problem and currentProblemId from the store reactively
  const problem = useAppStore((state) => state.problem);
  const currentProblemId = useAppStore((state) => state.currentProblemId);
  const [showSettings, setShowSettings] = useState(false);
  // Metrics pane expanded state, persisted in localStorage for better UX
  const [showMetrics, setShowMetrics] = useState<boolean>(() => {
    try {
      return localStorage.getItem('solverMetricsExpanded') === 'true';
    } catch {
      return false; // collapsed by default
    }
  });

  const toggleMetrics = () => {
    setShowMetrics((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('solverMetricsExpanded', String(next));
      } catch {
        // Ignore localStorage errors (e.g., in private browsing mode)
      }
      return next;
    });
  };

  const cancelledRef = useRef(false);
  const solverCompletedRef = useRef(false);
  const restartAfterSaveRef = useRef(false);
  const saveInProgressRef = useRef(false);
  // Snapshot of the problem configuration at the moment the solver starts
  const runProblemSnapshotRef = useRef<Problem | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Runtime input used for the quick-start (automatic) button
  const [desiredRuntimeMain, setDesiredRuntimeMain] = useState<number | null>(3);
  // Runtime input used inside the settings panel for the Auto-set feature
  const [desiredRuntimeSettings, setDesiredRuntimeSettings] = useState<number>(3);
  
  // Input states for allowing empty values during typing (using same pattern as group form)
  const [solverFormInputs, setSolverFormInputs] = useState<{
    maxIterations?: string;
    timeLimit?: string;
    noImprovement?: string;
    initialTemp?: string;
    finalTemp?: string;
    reheatCycles?: string;
    reheat?: string;
    desiredRuntimeSettings?: string;
    desiredRuntimeMain?: string;
  }>({});

  // Holds the settings that were actually used for the currently running / last run
  const [runSettings, setRunSettings] = useState<SolverSettings | null>(null);

  // Get solver settings from the current problem, with fallback to defaults
  const getDefaultSolverSettings = (): SolverSettings => ({
    solver_type: "SimulatedAnnealing",
    stop_conditions: {
      max_iterations: 10000,
      time_limit_seconds: 30,
      no_improvement_iterations: 5000,
    },
    solver_params: {
      SimulatedAnnealing: {
        initial_temperature: 1.0,
        final_temperature: 0.01,
        cooling_schedule: "geometric",
        reheat_cycles: 0,
        reheat_after_no_improvement: 0, // 0 = disabled
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

  const solverSettings = problem?.settings || getDefaultSolverSettings();

  const handleSettingsChange = (newSettings: Partial<SolverSettings>) => {
    if (problem && currentProblemId) {
      const updatedProblem = {
        ...problem,
        settings: {
          ...solverSettings,
          ...newSettings,
          // Deep merge for nested objects if necessary
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
      updateProblem({ settings: updatedProblem.settings });
    }
  };

  // No more simulation needed - real progress comes from WASM solver

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

  // Starts the solver. If `useRecommended` is true we first fetch automatic settings
  // using `get_recommended_settings` for the specified `desiredRuntime` seconds.
  const handleStartSolver = async (useRecommended: boolean = true) => {
    console.log('[SolverPanel] handleStartSolver called, current problem:', problem);
    console.log('[SolverPanel] currentProblemId at start:', currentProblemId);
    
    // Ensure a problem exists - this will create one if none exists
    const currentProblem = ensureProblemExists();
    console.log('[SolverPanel] ensureProblemExists returned:', currentProblem);
    console.log('[SolverPanel] currentProblemId after ensureProblemExists:', currentProblemId);
    
    if (!currentProblem.people || currentProblem.people.length === 0) {
      addNotification({
        type: 'error',
        title: 'No People',
        message: 'Please add people to the problem first',
      });
      return;
    }

    if (!currentProblem.groups || currentProblem.groups.length === 0) {
      addNotification({
        type: 'error',
        title: 'No Groups',
        message: 'Please add groups to the problem first',
      });
      return;
    }

    try {
      // Reset cancellation flag
      cancelledRef.current = false;
      solverCompletedRef.current = false;
      
      startSolver();
      addNotification({
        type: 'info',
        title: 'Solving',
        message: 'Optimization algorithm started',
      });

      // Decide which solver settings should be used for this run
      let selectedSettings: SolverSettings = solverSettings;

      if (useRecommended) {
        try {
          // 1️⃣ Fetch recommended settings from the WASM backend
          const rawSettings = await solverWorkerService.get_recommended_settings(currentProblem, desiredRuntimeMain ?? 3);

          // 2️⃣ Convert the flattened `solver_params` coming from Rust into the nested UI shape
          const sp = (rawSettings as SolverSettings & { solver_params: Record<string, unknown> }).solver_params;
          if (sp && !("SimulatedAnnealing" in sp) && sp.solver_type === "SimulatedAnnealing") {
            const { initial_temperature, final_temperature, cooling_schedule, reheat_cycles, reheat_after_no_improvement } = sp as {
              initial_temperature: number;
              final_temperature: number;
              cooling_schedule: string;
              reheat_cycles?: number;
              reheat_after_no_improvement: number;
            };
            selectedSettings = {
              ...rawSettings,
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
          } else {
            selectedSettings = rawSettings as SolverSettings;
          }

          // Use these recommended settings only for this run – do NOT persist them to the UI.
        } catch (err) {
          console.error("[SolverPanel] Failed to fetch recommended settings – falling back to existing settings", err);
        }
      }

      // Record these settings as the active run settings so progress bars use correct limits
      setRunSettings(selectedSettings);

      // Create the problem with the chosen solver settings
      const problemWithSettings = {
        ...currentProblem,
        settings: selectedSettings,
      };

      // Capture a deep snapshot of the problem configuration at solver start,
      // decoupling any subsequent UI edits from this solver run's saved results.
      try {
        runProblemSnapshotRef.current = JSON.parse(JSON.stringify(currentProblem));
      } catch {
        // Fallback to a shallow copy if deep clone fails for any reason
        runProblemSnapshotRef.current = { ...currentProblem } as Problem;
      }

      // Progress callback to update the UI in real-time
      const progressCallback = (progress: ProgressUpdate): boolean => {
        // Ignore progress updates if solver has already completed
        if (solverCompletedRef.current) {
          return false;
        }
        // Respect cancel immediately so we stop at the nearest callback tick
        if (cancelledRef.current) {
          return false;
        }
        
        // Debug logging for progress updates
        if (progress.iteration % 1000 === 0 || progress.iteration < 10) {
          console.log(`[SolverPanel] Progress ${progress.iteration}: current_score=${progress.current_score}, best_score=${progress.best_score}`);
        }
        
        setSolverState({
          // Preserve initial constraint penalty for baseline coloring
          ...(progress.iteration === 0 && { initialConstraintPenalty: progress.current_constraint_penalty }),
          currentIteration: progress.iteration,
          currentScore: progress.current_score,
          bestScore: progress.best_score,
          elapsedTime: progress.elapsed_seconds * 1000, // Convert to milliseconds
          noImprovementCount: progress.no_improvement_count,
          
          // === Live Algorithm Metrics ===
          temperature: progress.temperature,
          coolingProgress: progress.cooling_progress,
          
          // Move type statistics
          cliqueSwapsTried: progress.clique_swaps_tried,
          cliqueSwapsAccepted: progress.clique_swaps_accepted,
          transfersTried: progress.transfers_tried,
          transfersAccepted: progress.transfers_accepted,
          swapsTried: progress.swaps_tried,
          swapsAccepted: progress.swaps_accepted,
          
          // Acceptance rates
          overallAcceptanceRate: progress.overall_acceptance_rate,
          recentAcceptanceRate: progress.recent_acceptance_rate,
          
          // Move quality metrics
          avgAttemptedMoveDelta: progress.avg_attempted_move_delta,
          avgAcceptedMoveDelta: progress.avg_accepted_move_delta,
          biggestAcceptedIncrease: progress.biggest_accepted_increase,
          biggestAttemptedIncrease: progress.biggest_attempted_increase,
          
          // Score breakdown
          currentRepetitionPenalty: progress.current_repetition_penalty,
          currentBalancePenalty: progress.current_balance_penalty,
          currentConstraintPenalty: progress.current_constraint_penalty,
          bestRepetitionPenalty: progress.best_repetition_penalty,
          bestBalancePenalty: progress.best_balance_penalty,
          bestConstraintPenalty: progress.best_constraint_penalty,
          
          // Algorithm behavior
          reheatsPerformed: progress.reheats_performed,
          iterationsSinceLastReheat: progress.iterations_since_last_reheat,
          localOptimaEscapes: progress.local_optima_escapes,
          avgTimePerIterationMs: progress.avg_time_per_iteration_ms,
          
          // Success rates by move type
          cliqueSwapSuccessRate: progress.clique_swap_success_rate,
          transferSuccessRate: progress.transfer_success_rate,
          swapSuccessRate: progress.swap_success_rate,
          
          // Advanced analytics
          scoreVariance: progress.score_variance,
          searchEfficiency: progress.search_efficiency,
        });
        
        // Log significant score improvements
        if (progress.best_score < ((window as { lastLoggedBestScore?: number }).lastLoggedBestScore ?? 0) - 50 || !(window as { lastLoggedBestScore?: number }).lastLoggedBestScore) {
          console.log(`[SolverPanel] Significant improvement: best_score dropped to ${progress.best_score} at iteration ${progress.iteration}`);
          (window as { lastLoggedBestScore?: number }).lastLoggedBestScore = progress.best_score;
        }
        
        return true; // Continue solving
      };

      // Run the solver with progress updates using Web Worker
      const { solution, lastProgress } = await solverWorkerService.solveWithProgress(problemWithSettings, progressCallback);
      
      // Debug logging
      console.log('[SolverPanel] Solver completed');
      console.log('[SolverPanel] Solution final_score:', solution.final_score);
      console.log('[SolverPanel] Last progress best_score:', lastProgress?.best_score);
      console.log('[SolverPanel] Last progress current_score:', lastProgress?.current_score);
      
      // Mark solver as completed to prevent late progress updates
      solverCompletedRef.current = true;
      
      // Always capture the solution that came back (best-so-far when cancelled)
      setSolution(solution);
      
      // Determine the final no improvement count
      const finalNoImprovementCount = lastProgress 
        ? lastProgress.no_improvement_count 
        : solverState.noImprovementCount;

      // Add a small delay to ensure any late progress messages are ignored
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Update final solver state with actual final values from the last progress callback
      // Prefer lastProgress (which is emitted after a full recalculation) to avoid any drift.
      console.log('[SolverPanel] Setting final solver state with bestScore/currentScore from lastProgress');

      if (cancelledRef.current) {
        setSolverState({ 
          isRunning: false, 
          isComplete: false,
          currentIteration: solution.iteration_count,
          elapsedTime: solution.elapsed_time_ms,
          currentScore: lastProgress?.current_score ?? (solverState.currentScore ?? 0),
          bestScore: lastProgress?.best_score ?? solution.final_score,
          noImprovementCount: finalNoImprovementCount,
        });
      } else {
        setSolverState({ 
          isRunning: false, 
          isComplete: true,
          currentIteration: solution.iteration_count,
          elapsedTime: solution.elapsed_time_ms,
          currentScore: lastProgress?.current_score ?? (solverState.currentScore ?? 0),
          bestScore: lastProgress?.best_score ?? solution.final_score,
          noImprovementCount: finalNoImprovementCount,
        });
        addNotification({
          type: 'success',
          title: 'Optimization Complete',
          message: `Found solution with score ${solution.final_score.toFixed(2)}`,
        });
      }

      // Automatically save result if there's a current problem
      console.log('[SolverPanel] About to save result, currentProblemId:', currentProblemId);
      console.log('[SolverPanel] Problem exists:', !!problem);
      if (currentProblemId) {
        console.log('[SolverPanel] Saving result to problem:', currentProblemId);
        addResult(solution, selectedSettings, undefined, runProblemSnapshotRef.current || undefined);
      } else {
        console.log('[SolverPanel] No currentProblemId, result not saved');
        // If we have a problem but no currentProblemId, we should save it
        if (problem) {
          console.log('[SolverPanel] Creating new problem to save result');
          const newSaved = problemStorage.createProblem("Untitled Problem", problem);
          problemStorage.setCurrentProblemId(newSaved.id);
          // Update the store by calling the store's set method
          useAppStore.setState({ currentProblemId: newSaved.id });
          addResult(solution, selectedSettings, undefined, runProblemSnapshotRef.current || undefined);
        }
      }

      // Post-save notifications and optional resume when cancelled
      if (cancelledRef.current) {
        if (restartAfterSaveRef.current) {
          addNotification({
            type: 'success',
            title: 'Saved Best-So-Far',
            message: 'Resuming solver with the same settings...',
          });
          restartAfterSaveRef.current = false;
          cancelledRef.current = false;
          saveInProgressRef.current = false;
          const resumeProblem = problemWithSettings; // reuse same settings
          const initialSchedule = solution.assignments.reduce<Record<string, Record<string, string[]>>>((acc, a) => {
            const sessionKey = `session_${a.session_id}`;
            if (!acc[sessionKey]) acc[sessionKey] = {};
            if (!acc[sessionKey][a.group_id]) acc[sessionKey][a.group_id] = [];
            acc[sessionKey][a.group_id].push(a.person_id);
            return acc;
          }, {});
          // Reset completion flag so progress updates are accepted
          solverCompletedRef.current = false;
          // Mark running before starting the worker again
          startSolver();
          setTimeout(async () => {
            try {
              await solverWorkerService.solveWithProgressWarmStart(resumeProblem, initialSchedule, progressCallback);
            } catch (e) {
              console.error('[SolverPanel] Warm-start resume failed:', e);
              // Fallback to normal start
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              handleStartSolver(false);
            }
          }, 0);
          return;
        } else {
          addNotification({
            type: 'success',
            title: 'Saved Best-So-Far',
            message: 'Solver stopped and best-so-far solution saved.',
          });
          cancelledRef.current = false;
          saveInProgressRef.current = false;
          return;
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if this is a cancellation error
      if (errorMessage.includes('cancelled')) {
        setSolverState({ isRunning: false, isComplete: false });
        addNotification({
          type: 'warning',
          title: 'Solver Cancelled',
          message: 'Optimization was cancelled by user',
        });
      } else {
        setSolverState({ isRunning: false, error: errorMessage });
        addNotification({
          type: 'error',
          title: 'Solver Error',
          message: errorMessage,
        });
      }
    }
  };

  // Discard progress: hard-cancel the worker and do not save a solution
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

  // Save progress: request a graceful stop so the solver returns the best-so-far solution
  const handleCancelSave = () => {
    setShowCancelConfirm(false);
    if (!solverState.isRunning) return;
    cancelledRef.current = true; // progress callback will stop the solver and return a result
    addNotification({
      type: 'info',
      title: 'Stopping Solver',
      message: 'Saving best-so-far solution...',
    });
  };

  // Save best-so-far snapshot and resume solving
  const handleSaveBestSoFar = async () => {
    if (!solverState.isRunning) {
      addNotification({
        type: 'warning',
        title: 'Solver Not Running',
        message: 'Start the solver to save a best-so-far snapshot.',
      });
      return;
    }
    if (saveInProgressRef.current) {
      return; // ignore duplicate clicks while saving
    }

    // If the latest progress update included a best_schedule snapshot, save immediately without stopping
    const lastProgress = (solverWorkerService as unknown as { lastProgressUpdate?: ProgressUpdate }).lastProgressUpdate as ProgressUpdate | undefined;
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
        // Evaluate metrics for the snapshot using WASM on the main thread
        const problemForEval = problem
          ? { ...problem, settings: (runSettings || solverSettings) }
          : undefined;
        if (!problemForEval) throw new Error('No problem available for evaluation');

        const evaluated = await wasmService.evaluateSolution(problemForEval, assignments);
        // Preserve iteration/time from the moment of snapshot
        const evaluatedWithRunMeta = {
          ...evaluated,
          iteration_count: lastProgress.iteration,
          elapsed_time_ms: lastProgress.elapsed_seconds * 1000,
        } as typeof evaluated;
        const settingsForSave = (runSettings || solverSettings);
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
        // Fallback to saving without evaluated metrics, but keep best_score as final_score
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
        } as unknown as import('../types').Solution;
        const settingsForSave = (runSettings || solverSettings);
        addResult(fallbackSolution, settingsForSave, undefined, runProblemSnapshotRef.current || undefined);
      } finally {
        saveInProgressRef.current = false;
      }
      return;
    }

    // Fallback: no snapshot available from progress; perform graceful stop+resume
    saveInProgressRef.current = true;
    restartAfterSaveRef.current = true;
    cancelledRef.current = true;
    addNotification({
      type: 'info',
      title: 'Saving Best-So-Far',
      message: 'Snapshotting best result and resuming...',
    });
  };

  const handleResetSolver = () => {
    // Reset cancellation flag
    cancelledRef.current = false;
    solverCompletedRef.current = false;
    resetSolver();
    addNotification({
      type: 'info',
      title: 'Reset',
      message: 'Solver state reset',
    });
  };

  // Prefer settings of the active run; fall back to the editable solver settings
  const displaySettings = runSettings || solverSettings;

  const getProgressPercentage = () => {
    if (!displaySettings.stop_conditions.max_iterations) return 0;
    return Math.min(
      (solverState.currentIteration / displaySettings.stop_conditions.max_iterations) * 100,
      100
    );
  };

  const getTimeProgressPercentage = () => {
    if (!displaySettings.stop_conditions.time_limit_seconds) return 0;
    const timeLimit = displaySettings.stop_conditions.time_limit_seconds;
    return Math.min((solverState.elapsedTime / 1000 / timeLimit) * 100, 100);
  };

  const getNoImprovementProgressPercentage = () => {
    if (!displaySettings.stop_conditions.no_improvement_iterations) return 0;
    return Math.min(
      (solverState.noImprovementCount / displaySettings.stop_conditions.no_improvement_iterations) * 100,
      100
    );
  };

  const handleAutoSetSettings = async () => {
    // Ensure a problem exists - this will create one if none exists
    const currentProblem = ensureProblemExists();
    
    try {
      const recommendedSettings = await solverWorkerService.get_recommended_settings(currentProblem, desiredRuntimeSettings);

      // Transform solver_params to UI structure if returned in flattened form
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
      console.error("Error getting recommended settings:", error);
      addNotification({
        type: 'error',
        title: 'Auto-set Failed',
        message: `Could not determine recommended settings. ${error instanceof Error ? error.message : ''}`,
        duration: 5000,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Solver</h2>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
            Run the optimization algorithm to find the best solution
          </p>
        </div>
      </div>

      

      {/* Status Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Solver Status</h3>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              solverState.isRunning ? 'bg-success-500 animate-pulse-slow' : 'bg-gray-300'
            }`}></div>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {solverState.isRunning ? 'Running' : 'Idle'}
            </span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          {/* Runtime (s) */}
          <div className="flex flex-col items-start">
            <label className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Desired Runtime (s)
            </label>
            <input
              type="number"
              value={solverFormInputs.desiredRuntimeMain ?? (desiredRuntimeMain?.toString() || '')}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, desiredRuntimeMain: e.target.value }))}
              onBlur={() => {
                const inputValue = solverFormInputs.desiredRuntimeMain || (desiredRuntimeMain?.toString() || '');
                const numValue = inputValue === '' ? null : Number(inputValue);
                if (numValue === null || (!isNaN(numValue) && numValue >= 1)) {
                  setDesiredRuntimeMain(numValue);
                  setSolverFormInputs(prev => ({ ...prev, desiredRuntimeMain: undefined }));
                }
              }}
              disabled={solverState.isRunning}
              className="input w-full sm:w-28"
              min="1"
            />
          </div>
          {!solverState.isRunning ? (
            <button
              onClick={() => {
                console.log('[SolverPanel] Start Solver button clicked');
                handleStartSolver(true);
              }}
              className="btn-success flex-1 flex items-center justify-center space-x-2"
              disabled={!problem}
            >
              <Play className="h-4 w-4" />
              <span>Start Solver with Automatic Settings</span>
            </button>
          ) : (
            <div className="flex flex-1 gap-2">
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="btn-warning flex-1 flex items-center justify-center space-x-2"
              >
                <Pause className="h-4 w-4" />
                <span>Cancel Solver</span>
              </button>
              <button
                onClick={handleSaveBestSoFar}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
                title="Save best-so-far and continue solving"
              >
                <TrendingUp className="h-4 w-4" />
                <span>Save Best So Far</span>
              </button>
            </div>
          )}
          
          <button
            onClick={handleResetSolver}
            className="btn-secondary flex items-center justify-center space-x-2"
            disabled={solverState.isRunning}
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset</span>
          </button>
        </div>

        {/* Progress Bars */}
        <div className="space-y-4 mb-6">
          <div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>Iteration Progress</span>
              <span>{solverState.currentIteration.toLocaleString()} / {(displaySettings.stop_conditions.max_iterations || 0).toLocaleString()}</span>
            </div>
            <div className="w-full" style={{ backgroundColor: 'var(--border-secondary)' }}>
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${getProgressPercentage()}%`,
                  backgroundColor: '#2563eb' // Blue color for iteration progress
                }}
                data-percentage={getProgressPercentage()}
                data-debug="iteration-progress"
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>Time Progress</span>
              <span>{(solverState.elapsedTime / 1000).toFixed(1)}s / {displaySettings.stop_conditions.time_limit_seconds || 0}s</span>
            </div>
            <div className="w-full" style={{ backgroundColor: 'var(--border-secondary)' }}>
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${getTimeProgressPercentage()}%`,
                  backgroundColor: '#d97706' // Orange color for time progress
                }}
                data-percentage={getTimeProgressPercentage()}
                data-debug="time-progress"
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>No Improvement Progress</span>
              <span>{solverState.noImprovementCount.toLocaleString()} / {(displaySettings.stop_conditions.no_improvement_iterations || 0).toLocaleString()}</span>
            </div>
            <div className="w-full" style={{ backgroundColor: 'var(--border-secondary)' }}>
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${getNoImprovementProgressPercentage()}%`,
                  backgroundColor: '#dc2626' // Red color for no improvement progress
                }}
                data-percentage={getNoImprovementProgressPercentage()}
                data-debug="no-improvement-progress"
              ></div>
            </div>
          </div>
        </div>




        {/* Basic Metrics Grid */}
        <div className="flex flex-row gap-2 sm:gap-4 mb-6 overflow-x-auto">
          <div className="text-center p-3 sm:p-4 bg-primary-50 rounded-lg flex-shrink-0 min-w-0 flex-1">
            <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-primary-600 mx-auto mb-2" />
            <div className="text-lg sm:text-2xl font-bold text-primary-600">
              {solverState.currentIteration.toLocaleString()}
            </div>
            <div className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Iterations</div>
          </div>
          <div className="text-center p-3 sm:p-4 bg-success-50 rounded-lg flex-shrink-0 min-w-0 flex-1">
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-success-600 mx-auto mb-2" />
            <div className="text-lg sm:text-2xl font-bold text-success-600">
              {solverState.bestScore.toFixed(2)}
            </div>
            <div className="text-xs sm:text-sm flex items-center justify-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <span className="truncate">Best Cost Score</span>
              <Tooltip content={<span>Cost Score = (Weighted max possible contacts − weighted current contacts) + weighted constraint penalties. The solver is trying to minimize this score. <b>Lower is better.</b></span>}>
                <Info className="h-3 w-3 flex-shrink-0" />
              </Tooltip>
            </div>
          </div>
          <div className="text-center p-3 sm:p-4 rounded-lg flex-shrink-0 min-w-0 flex-1" style={{ backgroundColor: 'var(--background-secondary)' }}>
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2" style={{ color: 'var(--text-accent-blue)' }} />
            <div className="text-lg sm:text-2xl font-bold" style={{ color: 'var(--text-accent-blue)' }}>
              {(solverState.currentScore ?? 0).toFixed(2)}
            </div>
            <div className="text-xs sm:text-sm flex items-center justify-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <span className="truncate">Current Cost Score</span>
              <Tooltip content={<span>The current overall cost score of the working solution at this iteration. <b>Lower is better.</b></span>}>
                <Info className="h-3 w-3 flex-shrink-0" />
              </Tooltip>
            </div>
          </div>
          <div className="text-center p-3 sm:p-4 bg-warning-50 rounded-lg flex-shrink-0 min-w-0 flex-1">
            <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-warning-600 mx-auto mb-2" />
            <div className="text-lg sm:text-2xl font-bold text-warning-600">
              {(solverState.elapsedTime / 1000).toFixed(1)}s
            </div>
            <div className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Elapsed Time</div>
          </div>
        </div>

        {/* Live Algorithm Metrics */}
        <div className="mb-2">
          <button
            className="flex items-center gap-3 cursor-pointer mb-3 text-left"
            onClick={toggleMetrics}
          >
            {showMetrics ? (
              <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            ) : (
              <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            )}
            <BarChart3 className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
            <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Detailed Algorithm Metrics
            </h4>
          </button>
          
          {showMetrics && (
            <>
              {/* Temperature and Progress */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Temperature</span>
                    <Tooltip content="Current temperature of the simulated annealing algorithm.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-blue)' }}>
                    {solverState.temperature?.toFixed(4) || '0.0000'}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Cooling Progress</span>
                    <Tooltip content="Percentage of the way through the cooling schedule.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-purple)' }}>
                    {((solverState.coolingProgress || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Acceptance Rate</span>
                    <Tooltip content="Overall percentage of proposed moves that have been accepted.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-green)' }}>
                    {((solverState.overallAcceptanceRate || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Recent Acceptance</span>
                    <Tooltip content="Percentage of proposed moves accepted over the last 1000 iterations.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-orange)' }}>
                    {((solverState.recentAcceptanceRate || 0) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Move Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <h5 className="font-medium mb-2 flex items-center space-x-2" style={{ color: 'var(--text-accent-indigo)' }}>
                    <span>Clique Swaps</span>
                    <Tooltip content="Swapping two entire groups of people who are incompatible with their current groups but compatible with each other's.">
                      <Info className="h-4 w-4" />
                    </Tooltip>
                  </h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tried:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{solverState.cliqueSwapsTried?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Accepted:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{solverState.cliqueSwapsAccepted?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Success Rate:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{((solverState.cliqueSwapSuccessRate || 0) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <h5 className="font-medium mb-2 flex items-center space-x-2" style={{ color: 'var(--text-accent-teal)' }}>
                    <span>Transfers</span>
                    <Tooltip content="Moving a single person from one group to another.">
                      <Info className="h-4 w-4" />
                    </Tooltip>
                  </h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tried:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{solverState.transfersTried?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Accepted:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{solverState.transfersAccepted?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Success Rate:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{((solverState.transferSuccessRate || 0) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <h5 className="font-medium mb-2 flex items-center space-x-2" style={{ color: 'var(--text-accent-cyan)' }}>
                    <span>Regular Swaps</span>
                    <Tooltip content="Swapping two people from different groups.">
                      <Info className="h-4 w-4" />
                    </Tooltip>
                  </h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tried:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{solverState.swapsTried?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Accepted:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{solverState.swapsAccepted?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Success Rate:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{((solverState.swapSuccessRate || 0) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Algorithm Behavior */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Local Optima Escapes</span>
                    <Tooltip content="Number of times the algorithm accepted a move that resulted in a worse score to escape a local optimum.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-red)' }}>
                    {solverState.localOptimaEscapes?.toLocaleString() || '0'}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Reheats Performed</span>
                    <Tooltip content="Number of times the temperature was reset to its initial value.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-yellow)' }}>
                    {solverState.reheatsPerformed || '0'}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Avg Time/Iteration</span>
                    <Tooltip content="Average time taken to complete one iteration in milliseconds.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-pink)' }}>
                    {formatIterationTime(solverState.avgTimePerIterationMs || 0)}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Search Efficiency</span>
                    <Tooltip content="A measure of how effectively the search is exploring the solution space.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-emerald)' }}>
                    {(solverState.searchEfficiency || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Score Quality Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                   <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Avg Attempted Delta</span>
                    <Tooltip content="Average change in score for all proposed moves.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-lime)' }}>
                    {(solverState.avgAttemptedMoveDelta || 0).toFixed(3)}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                   <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Avg Accepted Delta</span>
                    <Tooltip content="Average change in score for all accepted moves.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-amber)' }}>
                    {(solverState.avgAcceptedMoveDelta || 0).toFixed(3)}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                   <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Max Attempted Delta</span>
                    <Tooltip content="Largest score increase from an attempted move.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-red)' }}>
                    {(solverState.biggestAttemptedIncrease || 0).toFixed(3)}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                   <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Max Accepted Delta</span>
                    <Tooltip content="Largest score increase from an accepted move (local optima escape).">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-orange)' }}>
                    {(solverState.biggestAcceptedIncrease || 0).toFixed(3)}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                   <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Score Variance</span>
                    <Tooltip content="Statistical variance of the score over time.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-rose)' }}>
                    {(solverState.scoreVariance || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Penalty Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Current Repetition Penalty</span>
                    <Tooltip content="Penalty applied for people who have been in groups together previously.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {solverState.currentRepetitionPenalty?.toFixed(2) || '0'}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                   <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Current Balance Penalty</span>
                    <Tooltip content="Penalty applied for imbalance in group sizes or attribute distribution.">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {solverState.currentBalancePenalty?.toFixed(2) || '0'}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}>
                   <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>Current Constraint Penalty</span>
                    <Tooltip content="Penalty applied for violating hard constraints (e.g., people who must or must not be together).">
                      <Info className="h-3 w-3" />
                    </Tooltip>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {solverState.currentConstraintPenalty?.toFixed(2) || '0'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <button
          onClick={() => setShowSettings(!showSettings)}
          className="btn-secondary flex items-center space-x-2 min-w-fit"
        >
          <Settings className="h-5 w-5 flex-shrink-0" />
          <span>Solve with Custom Settings</span>
        </button>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4 gap-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Manual Solver Configuration</h3>

            {/* Automatic Configuration (header right) */}
            <div className="flex items-end gap-2 p-3 rounded-lg" style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}>
              <div className="flex-grow">
                <label htmlFor="desiredRuntime" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Desired Runtime (s)
                </label>
                <input
                  id="desiredRuntime"
                  type="number"
                  value={solverFormInputs.desiredRuntimeSettings ?? desiredRuntimeSettings.toString()}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, desiredRuntimeSettings: e.target.value }))}
                  onBlur={() => {
                    const inputValue = solverFormInputs.desiredRuntimeSettings || desiredRuntimeSettings.toString();
                    const numValue = parseInt(inputValue);
                    if (!isNaN(numValue) && numValue >= 1) {
                      setDesiredRuntimeSettings(numValue);
                      setSolverFormInputs(prev => ({ ...prev, desiredRuntimeSettings: undefined }));
                    }
                  }}
                  disabled={solverState.isRunning}
                  className="input w-24 md:w-32"
                />
              </div>
              <Tooltip content={<span>Run a short trial to estimate optimal solver parameters for the specified runtime.</span>}>
                <button
                  onClick={handleAutoSetSettings}
                  disabled={solverState.isRunning}
                  className="btn-primary whitespace-nowrap"
                >
                  Auto-set
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label htmlFor="maxIterations" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Max Iterations
                </label>
                <Tooltip content="The maximum number of iterations the solver will run.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <input
                type="number"
                className="input"
                value={solverFormInputs.maxIterations ?? (solverSettings.stop_conditions.max_iterations || 10000).toString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, maxIterations: e.target.value }))}
                onBlur={() => {
                  const inputValue = solverFormInputs.maxIterations || (solverSettings.stop_conditions.max_iterations || 10000).toString();
                  const numValue = parseInt(inputValue);
                  if (!isNaN(numValue) && numValue >= 1) {
                    handleSettingsChange({
                      ...solverSettings,
                      stop_conditions: {
                        ...solverSettings.stop_conditions,
                        max_iterations: numValue
                      }
                    });
                    setSolverFormInputs(prev => ({ ...prev, maxIterations: undefined }));
                  }
                }}
                min="1"
                max="100000"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label htmlFor="timeLimit" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Time Limit (seconds)
                </label>
                <Tooltip content="The maximum time the solver will run in seconds.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <input
                type="number"
                className="input"
                value={solverFormInputs.timeLimit ?? (solverSettings.stop_conditions.time_limit_seconds || 30).toString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, timeLimit: e.target.value }))}
                onBlur={() => {
                  const inputValue = solverFormInputs.timeLimit || (solverSettings.stop_conditions.time_limit_seconds || 30).toString();
                  const numValue = parseInt(inputValue);
                  if (!isNaN(numValue) && numValue >= 1) {
                    handleSettingsChange({
                      ...solverSettings,
                      stop_conditions: {
                        ...solverSettings.stop_conditions,
                        time_limit_seconds: numValue
                      }
                    });
                    setSolverFormInputs(prev => ({ ...prev, timeLimit: undefined }));
                  }
                }}
                min="1"
                max="300"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label htmlFor="noImprovementLimit" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  No Improvement Limit
                </label>
                <Tooltip content="Stop after this many iterations without improvement.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <input
                type="number"
                className="input"
                value={solverFormInputs.noImprovement ?? (solverSettings.stop_conditions.no_improvement_iterations || 5000).toString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, noImprovement: e.target.value }))}
                onBlur={() => {
                  const inputValue = solverFormInputs.noImprovement || (solverSettings.stop_conditions.no_improvement_iterations || 5000).toString();
                  const numValue = parseInt(inputValue);
                  if (!isNaN(numValue) && numValue >= 1) {
                    handleSettingsChange({
                      ...solverSettings,
                      stop_conditions: {
                        ...solverSettings.stop_conditions,
                        no_improvement_iterations: numValue
                      }
                    });
                    setSolverFormInputs(prev => ({ ...prev, noImprovement: undefined }));
                  }
                }}
                min="1"
                max="50000"
                placeholder="Iterations without improvement before stopping"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label htmlFor="initialTemperature" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Initial Temperature
                </label>
                <Tooltip content="The starting temperature for the simulated annealing algorithm. Higher values allow more exploration.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <input
                type="number"
                className="input"
                value={solverFormInputs.initialTemp ?? (solverSettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0).toString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, initialTemp: e.target.value }))}
                onBlur={() => {
                  const inputValue = solverFormInputs.initialTemp || (solverSettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0).toString();
                  const numValue = parseFloat(inputValue);
                  if (!isNaN(numValue) && numValue >= 0.1) {
                    handleSettingsChange({
                      ...solverSettings,
                      solver_params: {
                        ...solverSettings.solver_params,
                        SimulatedAnnealing: {
                          ...solverSettings.solver_params.SimulatedAnnealing!,
                          initial_temperature: numValue
                        }
                      }
                    });
                    setSolverFormInputs(prev => ({ ...prev, initialTemp: undefined }));
                  }
                }}
                step="0.1"
                min="0.1"
                max="10.0"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label htmlFor="finalTemperature" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Final Temperature
                </label>
                <Tooltip content="The temperature at which the algorithm will stop.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <input
                type="number"
                className="input"
                value={solverFormInputs.finalTemp ?? (solverSettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01).toString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, finalTemp: e.target.value }))}
                onBlur={() => {
                  const inputValue = solverFormInputs.finalTemp || (solverSettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01).toString();
                  const numValue = parseFloat(inputValue);
                  if (!isNaN(numValue) && numValue >= 0.001) {
                    handleSettingsChange({
                      ...solverSettings,
                      solver_params: {
                        ...solverSettings.solver_params,
                        SimulatedAnnealing: {
                          ...solverSettings.solver_params.SimulatedAnnealing!,
                          final_temperature: numValue
                        }
                      }
                    });
                    setSolverFormInputs(prev => ({ ...prev, finalTemp: undefined }));
                  }
                }}
                step="0.001"
                min="0.001"
                max="1.0"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label htmlFor="reheatCycles" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Reheat Cycles
                </label>
                <Tooltip content="Number of cycles to cool from initial to final temperature, then reheat and repeat. 0 = disabled.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <input
                id="reheatCycles"
                type="number"
                className="input"
                value={solverFormInputs.reheatCycles ?? (solverSettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0).toString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, reheatCycles: e.target.value }))}
                onBlur={() => {
                  const inputValue = solverFormInputs.reheatCycles || (solverSettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0).toString();
                  const numValue = parseInt(inputValue);
                  if (!isNaN(numValue) && numValue >= 0) {
                    handleSettingsChange({
                      ...solverSettings,
                      solver_params: {
                        ...solverSettings.solver_params,
                        SimulatedAnnealing: {
                          ...solverSettings.solver_params.SimulatedAnnealing!,
                          reheat_cycles: numValue,
                        }
                      }
                    });
                    setSolverFormInputs(prev => ({ ...prev, reheatCycles: undefined }));
                  }
                }}
                min="0"
                max="100000"
                placeholder="0 = disabled"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label htmlFor="reheatAfterNoImprovement" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Reheat After No Improvement
                </label>
                <Tooltip content="Reset temperature to initial value after this many iterations without improvement (0 = disabled).">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <input
                type="number"
                className="input"
                value={solverFormInputs.reheat ?? (solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, reheat: e.target.value }))}
                onBlur={() => {
                  const inputValue = solverFormInputs.reheat || (solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toString();
                  const numValue = parseInt(inputValue);
                  if (!isNaN(numValue) && numValue >= 0) {
                    handleSettingsChange({
                      ...solverSettings,
                      solver_params: {
                        ...solverSettings.solver_params,
                        SimulatedAnnealing: {
                          ...solverSettings.solver_params.SimulatedAnnealing!,
                          reheat_after_no_improvement: numValue
                        }
                      }
                    });
                    setSolverFormInputs(prev => ({ ...prev, reheat: undefined }));
                  }
                }}
                min="0"
                max="50000"
                placeholder="0 = disabled"
              />
            </div>
            {/* Debug options */}
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Debug: Validate Invariants
                </label>
                <Tooltip content="Check for duplicate assignments after each accepted move. Expensive – for debugging only.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={!!solverSettings.logging?.debug_validate_invariants}
                  onChange={(e) => handleSettingsChange({
                    logging: {
                      ...solverSettings.logging,
                      debug_validate_invariants: e.target.checked,
                    },
                  })}
                  disabled={solverState.isRunning}
                />
                Enable invariant validation
              </label>
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Debug: Dump Invariant Context
                </label>
                <Tooltip content="If an invariant fails, include move details and partial schedule in error output.">
                  <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </div>
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={!!solverSettings.logging?.debug_dump_invariant_context}
                  onChange={(e) => handleSettingsChange({
                    logging: {
                      ...solverSettings.logging,
                      debug_dump_invariant_context: e.target.checked,
                    },
                  })}
                  disabled={solverState.isRunning}
                />
                Include detailed context on violation
              </label>
            </div>
          </div>

          {/* --- Custom Settings Start Button (inside settings panel) --- */}
          <div className="mt-6">
            <button
              onClick={() => handleStartSolver(false)}
              disabled={solverState.isRunning}
              className="btn-success w-full flex items-center justify-center space-x-2"
            >
              <Play className="h-4 w-4" />
              <span>Start Solver with Custom Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCancelConfirm(false)}></div>
          <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-lg p-5 w-full max-w-md" style={{ border: '1px solid var(--border-secondary)' }}>
            <h4 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Cancel Solver?</h4>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Do you want to save the current progress as a solution or discard it?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowCancelConfirm(false)}>Back</button>
              <button className="btn-warning" onClick={handleCancelDiscard}>Discard Progress</button>
              <button className="btn-success" onClick={handleCancelSave}>Save Progress</button>
            </div>
          </div>
        </div>
      )}

      {/* Algorithm Info */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Algorithm Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Simulated Annealing</h4>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              A probabilistic optimization algorithm that mimics the annealing process in metallurgy.
            </p>
            <ul className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>• Starts with high temperature for exploration</li>
              <li>• Gradually cools to focus on local improvements</li>
              <li>• Can escape local optima</li>
              <li>• Optional reheat feature restarts exploration when stuck</li>
              <li>• Well-suited for combinatorial problems</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Current Parameters</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Initial Temperature:</span>
                <span className="font-medium">{displaySettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Final Temperature:</span>
                <span className="font-medium">{displaySettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Max Iterations:</span>
                <span className="font-medium">{(displaySettings.stop_conditions.max_iterations || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Time Limit:</span>
                <span className="font-medium">{displaySettings.stop_conditions.time_limit_seconds || 0}s</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>No Improvement Limit:</span>
                <span className="font-medium">{(displaySettings.stop_conditions.no_improvement_iterations || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Reheat After:</span>
                <span className="font-medium">
                  {(displaySettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0) === 0 
                    ? 'Disabled' 
                    : (displaySettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toLocaleString()
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Reheat Cycles:</span>
                <span className="font-medium">
                  {(displaySettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0) === 0
                    ? 'Disabled'
                    : (displaySettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0).toLocaleString()
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 