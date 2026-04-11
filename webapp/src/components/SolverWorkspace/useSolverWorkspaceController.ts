import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildSolverCatalog, normalizeSolverFamilyId, switchSolverFamily, type SolverCatalogEntry } from '../../services/solverUi';
import { useAppStore } from '../../store';
import {
  getResolvedSolverWorkspaceSectionsByGroup,
  getSolverWorkspacePath,
  resolveSolverWorkspaceSection,
} from './navigation/solverWorkspaceNav';
import type { SolverWorkspaceResolvedSection, SolverWorkspaceSectionId } from './navigation/solverWorkspaceNavTypes';

export interface SolverWorkspaceController {
  activeSection: SolverWorkspaceSectionId;
  groupedSections: Array<{
    group: {
      id: string;
      label: string;
      description: string;
    };
    sections: SolverWorkspaceResolvedSection[];
  }>;
  solverCatalog: readonly SolverCatalogEntry[];
  solverCatalogStatus: 'loading' | 'ready' | 'error';
  solverCatalogErrorMessage: string | null;
  selectedSolverFamilyId: 'solver1' | 'solver3';
  activeManualFamilyId: 'solver1' | 'solver3' | null;
  navigateToSection: (sectionId: SolverWorkspaceSectionId) => void;
}

export function useSolverWorkspaceController(): SolverWorkspaceController {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const scenario = useAppStore((state) => state.scenario);
  const runtimeSolverCatalog = useAppStore((state) => state.runtimeSolverCatalog);
  const runtimeSolverCatalogStatus = useAppStore((state) => state.runtimeSolverCatalogStatus);
  const runtimeSolverCatalogError = useAppStore((state) => state.runtimeSolverCatalogError);
  const loadRuntimeSolverCatalog = useAppStore((state) => state.loadRuntimeSolverCatalog);
  const updateScenario = useAppStore((state) => state.updateScenario);

  const activeSection = resolveSolverWorkspaceSection(section);
  const solverCatalog = useMemo(() => buildSolverCatalog(runtimeSolverCatalog), [runtimeSolverCatalog]);
  const solverCatalogStatus = runtimeSolverCatalogStatus === 'idle' ? 'loading' : runtimeSolverCatalogStatus;
  const groupedSections = useMemo(
    () => getResolvedSolverWorkspaceSectionsByGroup(solverCatalog, solverCatalogStatus),
    [solverCatalog, solverCatalogStatus],
  );
  const selectedSolverFamilyId = (normalizeSolverFamilyId(scenario?.settings.solver_type) ?? 'solver1') as 'solver1' | 'solver3';
  const activeManualFamilyId = activeSection === 'run' ? null : activeSection;

  useEffect(() => {
    if (runtimeSolverCatalogStatus === 'idle') {
      void loadRuntimeSolverCatalog().catch((error) => {
        console.error('[SolverWorkspace] Failed to load solver catalog from runtime.', error);
      });
    }
  }, [loadRuntimeSolverCatalog, runtimeSolverCatalogStatus]);

  useEffect(() => {
    if (section && section !== activeSection) {
      navigate(getSolverWorkspacePath(activeSection), { replace: true });
    }
  }, [activeSection, navigate, section]);

  useEffect(() => {
    if (!scenario || !activeManualFamilyId || selectedSolverFamilyId === activeManualFamilyId) {
      return;
    }

    updateScenario({
      settings: switchSolverFamily(scenario.settings, activeManualFamilyId),
    });
  }, [activeManualFamilyId, scenario, selectedSolverFamilyId, updateScenario]);

  return {
    activeSection,
    groupedSections,
    solverCatalog,
    solverCatalogStatus,
    solverCatalogErrorMessage: runtimeSolverCatalogError,
    selectedSolverFamilyId,
    activeManualFamilyId,
    navigateToSection: (sectionId) => navigate(getSolverWorkspacePath(sectionId)),
  };
}
