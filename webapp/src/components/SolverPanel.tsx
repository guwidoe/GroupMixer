import React from 'react';
import { SolverCancelModal } from './SolverPanel/SolverCancelModal';
import { useSolverWorkspaceRunController } from './SolverWorkspace/useSolverWorkspaceRunController';
import { AllowedSessionsPanel } from './SolverWorkspace/blocks/AllowedSessionsPanel';
import { DetailedMetricsPanel } from './SolverWorkspace/blocks/DetailedMetricsPanel';
import { RecommendedSettingsPanel } from './SolverWorkspace/blocks/RecommendedSettingsPanel';
import { SolverFamilyChooser } from './SolverWorkspace/blocks/SolverFamilyChooser';
import { SolverFamilyInfoPanel } from './SolverWorkspace/blocks/SolverFamilyInfoPanel';
import { SolverRunControls } from './SolverWorkspace/blocks/SolverRunControls';
import { SolverSettingsSections } from './SolverWorkspace/blocks/SolverSettingsSections';
import { SolverStatusDashboard } from './SolverWorkspace/blocks/SolverStatusDashboard';
import { WarmStartPanel } from './SolverWorkspace/blocks/WarmStartPanel';

interface SolverPanelProps {
  hidePageHeader?: boolean;
}

export function SolverPanel({ hidePageHeader = false }: SolverPanelProps) {
  const controller = useSolverWorkspaceRunController();

  return (
    <div className="space-y-6">
      {!hidePageHeader ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Solver
            </h2>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              Run the optimization algorithm to find the best solution
            </p>
          </div>
        </div>
      ) : null}

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
        startMode="manual"
        onStartSolver={controller.handleStartSolver}
        onCancelSolver={() => controller.setShowCancelConfirm(true)}
        onSaveBestSoFar={controller.handleSaveBestSoFar}
        onResetSolver={controller.handleResetSolver}
      />

      <SolverStatusDashboard solverState={controller.solverState} displaySettings={controller.displaySettings} />

      <DetailedMetricsPanel
        solverState={controller.solverState}
        displaySettings={controller.displaySettings}
        showMetrics={controller.showMetrics}
        onToggleMetrics={controller.toggleMetrics}
      />

      <SolverFamilyChooser
        selectedSolverFamilyId={controller.selectedSolverFamilyId}
        solverCatalog={controller.solverCatalog}
        onSelectSolverFamily={controller.handleSelectSolverFamily}
        isRunning={controller.solverState.isRunning}
      />

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
        usesAutoRuntimePolicy={controller.selectedSolverFamilyId === 'auto'}
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

      <SolverSettingsSections
        solverSettings={controller.solverSettings}
        solverUiSpec={controller.selectedSolverUiSpec}
        solverFormInputs={controller.solverFormInputs}
        setSolverFormInputs={controller.setSolverFormInputs}
        handleSettingsChange={controller.handleSettingsChange}
        isRunning={controller.solverState.isRunning}
      />

      <SolverFamilyInfoPanel displaySettings={controller.displaySettings} solverCatalogEntry={controller.selectedSolverCatalogEntry} />

      <SolverCancelModal
        open={controller.showCancelConfirm}
        onClose={() => controller.setShowCancelConfirm(false)}
        onDiscard={controller.handleCancelDiscard}
        onSave={controller.handleCancelSave}
      />
    </div>
  );
}
