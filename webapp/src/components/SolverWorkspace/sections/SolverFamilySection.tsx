import React from 'react';
import type { SolverWorkspaceResolvedSection } from '../navigation/solverWorkspaceNavTypes';
import { getSolverUiSpec } from '../../../services/solverUi';
import { AllowedSessionsPanel } from '../blocks/AllowedSessionsPanel';
import { DetailedMetricsPanel } from '../blocks/DetailedMetricsPanel';
import { RecommendedSettingsPanel } from '../blocks/RecommendedSettingsPanel';
import { SolverFamilyInfoPanel } from '../blocks/SolverFamilyInfoPanel';
import { SolverRunControls } from '../blocks/SolverRunControls';
import { SolverSettingsSections } from '../blocks/SolverSettingsSections';
import { SolverStatusDashboard } from '../blocks/SolverStatusDashboard';
import { WarmStartPanel } from '../blocks/WarmStartPanel';
import { useSolverWorkspaceRunController } from '../useSolverWorkspaceRunController';

interface SolverFamilySectionProps {
  section: SolverWorkspaceResolvedSection;
}

export function SolverFamilySection({ section }: SolverFamilySectionProps) {
  const controller = useSolverWorkspaceRunController();
  const solverUiSpec = section.familyId ? getSolverUiSpec(section.familyId) : null;
  const description = solverUiSpec?.shortDescription ?? section.description;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          Manual tuning
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {section.label}
          </h1>
          {section.catalogEntry?.experimental ? (
            <span
              className="rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.04em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              Experimental
            </span>
          ) : null}
        </div>
        <p className="max-w-3xl text-sm" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </header>

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
            startMode="manual"
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
        </div>
      </div>

      <SolverSettingsSections
        solverSettings={controller.solverSettings}
        solverUiSpec={controller.selectedSolverUiSpec}
        solverFormInputs={controller.solverFormInputs}
        setSolverFormInputs={controller.setSolverFormInputs}
        handleSettingsChange={controller.handleSettingsChange}
        isRunning={controller.solverState.isRunning}
      />

      <div className="space-y-6">
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
