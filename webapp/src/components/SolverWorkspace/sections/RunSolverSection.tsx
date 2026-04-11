import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AllowedSessionsPanel } from '../blocks/AllowedSessionsPanel';
import { SolverFamilyChooser } from '../blocks/SolverFamilyChooser';
import { SolverRunControls } from '../blocks/SolverRunControls';
import { SolverStatusDashboard } from '../blocks/SolverStatusDashboard';
import { WarmStartPanel } from '../blocks/WarmStartPanel';
import { useSolverWorkspaceRunController } from '../useSolverWorkspaceRunController';

export function RunSolverSection() {
  const controller = useSolverWorkspaceRunController();
  const [showOptions, setShowOptions] = React.useState(false);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          Recommended workflow
        </div>
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Run Solver
          </h1>
          <p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--text-secondary)' }}>
            Start solving immediately with the recommended workflow. Advanced solver tuning lives in the manual pages.
          </p>
        </div>
      </header>

      <SolverRunControls
        solverState={controller.solverState}
        scenario={controller.scenario}
        selectedSolverCatalogEntry={controller.selectedSolverCatalogEntry}
        solverCatalogStatus={controller.solverCatalogStatus}
        solverCatalogErrorMessage={controller.solverCatalogErrorMessage}
        solverFormInputs={controller.solverFormInputs}
        setSolverFormInputs={controller.setSolverFormInputs}
        desiredRuntimeMain={controller.desiredRuntimeMain}
        setDesiredRuntimeMain={controller.setDesiredRuntimeMain}
        startMode="recommended"
        runtimeHelpText="Increase runtime for better results. Short runs finish faster; longer runs usually find better schedules."
        onStartSolver={controller.handleStartSolver}
        onCancelSolver={() => controller.setShowCancelConfirm(true)}
        onSaveBestSoFar={controller.handleSaveBestSoFar}
        onResetSolver={controller.handleResetSolver}
      />

      <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <button
          type="button"
          onClick={() => setShowOptions((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={showOptions}
          aria-controls="run-solver-options"
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Options
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Change solver, warm start, or session scope only if you need to.
            </p>
          </div>
          {showOptions ? (
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          )}
        </button>

        {showOptions ? (
          <div id="run-solver-options" className="mt-4 space-y-4 border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
            <SolverFamilyChooser
              selectedSolverFamilyId={controller.selectedSolverFamilyId}
              solverCatalog={controller.solverCatalog}
              onSelectSolverFamily={controller.handleSelectSolverFamily}
              isRunning={controller.solverState.isRunning}
            />

            <WarmStartPanel
              savedScenarios={controller.savedScenarios}
              currentScenarioId={controller.currentScenarioId}
              warmStartSelection={controller.warmStartSelection}
              setWarmStartSelection={controller.setWarmStartSelection}
              setWarmStartFromResult={controller.setWarmStartFromResult}
            />

            <AllowedSessionsPanel
              scenario={controller.scenario}
              solverSettings={controller.solverSettings}
              allowedSessionsLocal={controller.allowedSessionsLocal}
              setAllowedSessionsLocal={controller.setAllowedSessionsLocal}
              handleSettingsChange={controller.handleSettingsChange}
              isRunning={controller.solverState.isRunning}
            />
          </div>
        ) : null}
      </div>

      <SolverStatusDashboard solverState={controller.solverState} displaySettings={controller.displaySettings} />
    </section>
  );
}
