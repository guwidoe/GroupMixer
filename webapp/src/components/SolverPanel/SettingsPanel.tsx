/**
 * SettingsPanel - Manual solver configuration panel.
 */

import React from 'react';
import type { Scenario, SavedScenario, SolverSettings } from '../../types';
import type { SolverCatalogEntry, SolverFamilyId, SolverUiSpec } from '../../services/solverUi';
import type { SolverFormInputs } from './SettingsPanel/types';
import { AutoConfigPanel } from './SettingsPanel/AutoConfigPanel';
import { WarmStartSelector } from './SettingsPanel/WarmStartSelector';
import { AllowedSessionsSelector } from './SettingsPanel/AllowedSessionsSelector';
import { SolverSettingsGrid } from './SettingsPanel/SolverSettingsGrid';
import { StartSolverButton } from './SettingsPanel/StartSolverButton';
import { SolverSelector } from './SettingsPanel/SolverSelector';

interface SettingsPanelProps {
  solverSettings: SolverSettings;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  isRunning: boolean;
  desiredRuntimeSettings: number;
  setDesiredRuntimeSettings: React.Dispatch<React.SetStateAction<number>>;
  onAutoSetSettings: () => Promise<void>;
  onStartSolver: (useRecommended: boolean) => Promise<void>;
  selectedSolverFamilyId: SolverFamilyId;
  solverCatalog: readonly SolverCatalogEntry[];
  solverCatalogStatus: 'loading' | 'ready' | 'error';
  solverCatalogErrorMessage: string | null;
  selectedSolverCatalogEntry: SolverCatalogEntry | null;
  selectedSolverUiSpec: SolverUiSpec | null;
  onSelectSolverFamily: (familyId: SolverFamilyId) => void;
  scenario: Scenario | null;
  savedScenarios: Record<string, SavedScenario>;
  currentScenarioId: string | null;
  warmStartSelection: string | null;
  setWarmStartSelection: React.Dispatch<React.SetStateAction<string | null>>;
  setWarmStartFromResult: (id: string | null) => void;
  allowedSessionsLocal: number[] | null;
  setAllowedSessionsLocal: React.Dispatch<React.SetStateAction<number[] | null>>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  solverSettings,
  solverFormInputs,
  setSolverFormInputs,
  handleSettingsChange,
  isRunning,
  desiredRuntimeSettings,
  setDesiredRuntimeSettings,
  onAutoSetSettings,
  onStartSolver,
  selectedSolverFamilyId,
  solverCatalog,
  solverCatalogStatus,
  solverCatalogErrorMessage,
  selectedSolverCatalogEntry,
  selectedSolverUiSpec,
  onSelectSolverFamily,
  scenario,
  savedScenarios,
  currentScenarioId,
  warmStartSelection,
  setWarmStartSelection,
  setWarmStartFromResult,
  allowedSessionsLocal,
  setAllowedSessionsLocal,
}) => {
  return (
    <div className="card">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4 gap-4">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Manual Solver Configuration
        </h3>
        <AutoConfigPanel
          solverFormInputs={solverFormInputs}
          setSolverFormInputs={setSolverFormInputs}
          desiredRuntimeSettings={desiredRuntimeSettings}
          setDesiredRuntimeSettings={setDesiredRuntimeSettings}
          onAutoSetSettings={onAutoSetSettings}
          isRunning={isRunning}
          solverCatalogStatus={solverCatalogStatus}
          solverCatalogErrorMessage={solverCatalogErrorMessage}
          supportsRecommendedSettings={selectedSolverCatalogEntry?.capabilities.supportsRecommendedSettings ?? false}
          solverDisplayName={selectedSolverCatalogEntry?.displayName ?? solverSettings.solver_type}
        />
      </div>

      {solverCatalogStatus === 'ready' ? (
        <SolverSelector
          selectedSolverFamilyId={selectedSolverFamilyId}
          solverCatalog={solverCatalog}
          onSelectSolverFamily={onSelectSolverFamily}
          isRunning={isRunning}
        />
      ) : (
        <div
          className="mb-6 p-4 rounded-lg border text-sm"
          style={{
            borderColor: solverCatalogStatus === 'error' ? 'var(--color-danger)' : 'var(--border-secondary)',
            backgroundColor: 'var(--background-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            {solverCatalogStatus === 'loading' ? 'Loading Solver Catalog' : 'Solver Catalog Unavailable'}
          </div>
          <p>
            {solverCatalogStatus === 'loading'
              ? 'Fetching solver families and capability metadata from the runtime.'
              : `Runtime solver discovery failed: ${solverCatalogErrorMessage ?? 'unknown error'}`}
          </p>
        </div>
      )}

      <WarmStartSelector
        savedScenarios={savedScenarios}
        currentScenarioId={currentScenarioId}
        warmStartSelection={warmStartSelection}
        setWarmStartSelection={setWarmStartSelection}
        setWarmStartFromResult={setWarmStartFromResult}
      />

      <AllowedSessionsSelector
        scenario={scenario}
        solverSettings={solverSettings}
        allowedSessionsLocal={allowedSessionsLocal}
        setAllowedSessionsLocal={setAllowedSessionsLocal}
        handleSettingsChange={handleSettingsChange}
        isRunning={isRunning}
      />

      <SolverSettingsGrid
        solverSettings={solverSettings}
        solverUiSpec={selectedSolverUiSpec}
        solverFormInputs={solverFormInputs}
        setSolverFormInputs={setSolverFormInputs}
        handleSettingsChange={handleSettingsChange}
        isRunning={isRunning}
      />

      <StartSolverButton
        onStartSolver={onStartSolver}
        isRunning={isRunning}
        solverCatalogStatus={solverCatalogStatus}
        supportsRecommendedSettings={selectedSolverCatalogEntry?.capabilities.supportsRecommendedSettings ?? false}
      />
    </div>
  );
};

export default SettingsPanel;
