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
          supportsRecommendedSettings={selectedSolverCatalogEntry?.capabilities.supportsRecommendedSettings ?? false}
          solverDisplayName={selectedSolverCatalogEntry?.displayName ?? solverSettings.solver_type}
        />
      </div>

      <SolverSelector
        selectedSolverFamilyId={selectedSolverFamilyId}
        solverCatalog={solverCatalog}
        onSelectSolverFamily={onSelectSolverFamily}
        isRunning={isRunning}
      />

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
        supportsRecommendedSettings={selectedSolverCatalogEntry?.capabilities.supportsRecommendedSettings ?? false}
      />
    </div>
  );
};

export default SettingsPanel;
