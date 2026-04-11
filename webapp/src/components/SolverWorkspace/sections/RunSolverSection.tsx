import React from 'react';
import { AllowedSessionsPanel } from '../blocks/AllowedSessionsPanel';
import { DetailedMetricsPanel } from '../blocks/DetailedMetricsPanel';
import { LiveVisualizationPanel } from '../blocks/LiveVisualizationPanel';
import { RecommendedSettingsPanel } from '../blocks/RecommendedSettingsPanel';
import { SolverFamilyChooser } from '../blocks/SolverFamilyChooser';
import { SolverFamilyInfoPanel } from '../blocks/SolverFamilyInfoPanel';
import { SolverRunControls } from '../blocks/SolverRunControls';
import { SolverStatusDashboard } from '../blocks/SolverStatusDashboard';
import { WarmStartPanel } from '../blocks/WarmStartPanel';
import { useSolverWorkspaceRunController } from '../useSolverWorkspaceRunController';

export function RunSolverSection() {
  const controller = useSolverWorkspaceRunController();

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
            Choose a solver family, apply recommended settings when supported, and monitor diagnostics without dropping into the full manual tuning surface.
          </p>
        </div>
      </header>

      <SolverFamilyChooser
        selectedSolverFamilyId={controller.selectedSolverFamilyId}
        solverCatalog={controller.solverCatalog}
        onSelectSolverFamily={controller.handleSelectSolverFamily}
        isRunning={controller.solverState.isRunning}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.95fr)]">
        <div className="space-y-6">
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
            onStartSolver={controller.handleStartSolver}
            onCancelSolver={() => controller.setShowCancelConfirm(true)}
            onSaveBestSoFar={controller.handleSaveBestSoFar}
            onResetSolver={controller.handleResetSolver}
          />

          <SolverStatusDashboard solverState={controller.solverState} displaySettings={controller.displaySettings} />
        </div>

        <div className="space-y-6">
          <RecommendedSettingsPanel
            solverFormInputs={controller.solverFormInputs}
            setSolverFormInputs={controller.setSolverFormInputs}
            desiredRuntimeSettings={controller.desiredRuntimeSettings}
            setDesiredRuntimeSettings={controller.setDesiredRuntimeSettings}
            onAutoSetSettings={controller.handleAutoSetSettings}
            isRunning={controller.solverState.isRunning}
            solverCatalogStatus={controller.solverCatalogStatus}
            solverCatalogErrorMessage={controller.solverCatalogErrorMessage}
            supportsRecommendedSettings={controller.selectedSolverCatalogEntry?.capabilities.supportsRecommendedSettings ?? false}
            solverDisplayName={controller.selectedSolverCatalogEntry?.displayName ?? controller.solverSettings.solver_type}
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
      </div>

      <div className="space-y-6">
        <LiveVisualizationPanel
          solverStateIsRunning={controller.solverState.isRunning}
          showLiveViz={controller.showLiveViz}
          onToggleLiveViz={controller.toggleLiveViz}
          liveVizState={controller.liveVizState}
          liveVizPluginId={controller.liveVizPluginId}
          onLiveVizPluginChange={controller.handleLiveVizPluginChange}
          getLiveVizScenario={controller.getLiveVizScenario}
        />

        <DetailedMetricsPanel
          solverState={controller.solverState}
          displaySettings={controller.displaySettings}
          showMetrics={controller.showMetrics}
          onToggleMetrics={controller.toggleMetrics}
        />

        <SolverFamilyInfoPanel
          displaySettings={controller.displaySettings}
          solverCatalogEntry={controller.selectedSolverCatalogEntry}
        />
      </div>
    </section>
  );
}
