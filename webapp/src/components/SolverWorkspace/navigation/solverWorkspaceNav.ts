import { FlaskConical, PlayCircle, SlidersHorizontal } from 'lucide-react';
import type { SolverCatalogEntry } from '../../../services/solverUi';
import type {
  SolverWorkspaceResolvedSection,
  SolverWorkspaceSectionDefinition,
  SolverWorkspaceSectionGroupDefinition,
  SolverWorkspaceSectionId,
} from './solverWorkspaceNavTypes';

export const DEFAULT_SOLVER_WORKSPACE_SECTION: SolverWorkspaceSectionId = 'run';

export const SOLVER_WORKSPACE_SECTION_GROUPS: readonly SolverWorkspaceSectionGroupDefinition[] = [
  {
    id: 'run',
    label: 'Run',
    order: 1,
    description: 'Recommended solver workflow for most users.',
  },
  {
    id: 'manual-tuning',
    label: 'Manual Tuning',
    order: 2,
    description: 'Direct access to solver-family-specific tuning surfaces.',
  },
] as const;

export const SOLVER_WORKSPACE_SECTIONS: readonly SolverWorkspaceSectionDefinition[] = [
  {
    id: 'run',
    routeSegment: 'run',
    label: 'Run Solver',
    description: 'Use the default solver workflow with recommended settings and live diagnostics.',
    group: 'run',
    order: 1,
    icon: PlayCircle,
  },
  {
    id: 'solver1',
    routeSegment: 'solver1',
    label: 'Solver 1',
    description: 'Manually tune Solver 1 while keeping run controls and diagnostics on the same page.',
    group: 'manual-tuning',
    order: 2,
    icon: SlidersHorizontal,
    familyId: 'solver1',
  },
  {
    id: 'solver3',
    routeSegment: 'solver3',
    label: 'Solver 3',
    description: 'Manually tune Solver 3 while keeping run controls and diagnostics on the same page.',
    group: 'manual-tuning',
    order: 3,
    icon: FlaskConical,
    familyId: 'solver3',
  },
] as const;

export function getSolverWorkspaceSectionById(sectionId: string | null | undefined): SolverWorkspaceSectionDefinition | undefined {
  if (!sectionId) {
    return undefined;
  }

  return SOLVER_WORKSPACE_SECTIONS.find((section) => section.id === sectionId);
}

export function resolveSolverWorkspaceSection(sectionId: string | null | undefined): SolverWorkspaceSectionId {
  return getSolverWorkspaceSectionById(sectionId)?.id ?? DEFAULT_SOLVER_WORKSPACE_SECTION;
}

export function getSolverWorkspacePath(sectionId: string | null | undefined): string {
  const resolvedSection = getSolverWorkspaceSectionById(sectionId) ?? getSolverWorkspaceSectionById(DEFAULT_SOLVER_WORKSPACE_SECTION);
  return `/app/solver/${resolvedSection?.routeSegment ?? DEFAULT_SOLVER_WORKSPACE_SECTION}`;
}

export function getSolverWorkspaceSectionGroups(): SolverWorkspaceSectionGroupDefinition[] {
  return SOLVER_WORKSPACE_SECTION_GROUPS.slice().sort((left, right) => left.order - right.order);
}

function resolveVisibleSections(catalog: readonly SolverCatalogEntry[], catalogStatus: 'loading' | 'ready' | 'error') {
  if (catalogStatus !== 'ready') {
    return SOLVER_WORKSPACE_SECTIONS;
  }

  const visibleManualFamilies = new Set(
    catalog
      .filter((entry) => entry.uiSpecAvailable && (entry.id === 'solver1' || entry.id === 'solver3'))
      .map((entry) => entry.id),
  );

  return SOLVER_WORKSPACE_SECTIONS.filter((section) => {
    if (!section.familyId) {
      return true;
    }

    return visibleManualFamilies.has(section.familyId);
  });
}

export function getResolvedSolverWorkspaceSectionsByGroup(
  catalog: readonly SolverCatalogEntry[],
  catalogStatus: 'loading' | 'ready' | 'error',
): Array<{
  group: SolverWorkspaceSectionGroupDefinition;
  sections: SolverWorkspaceResolvedSection[];
}> {
  const visibleSections = resolveVisibleSections(catalog, catalogStatus);

  return getSolverWorkspaceSectionGroups()
    .map((group) => {
      const sections = visibleSections
        .filter((section) => section.group === group.id)
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((section) => ({
          ...section,
          label: section.familyId
            ? catalog.find((entry) => entry.id === section.familyId)?.displayName ?? section.label
            : section.label,
          shortLabel: section.familyId
            ? catalog.find((entry) => entry.id === section.familyId)?.displayName ?? section.shortLabel
            : section.shortLabel,
          tooltipDescription: section.familyId
            ? catalog.find((entry) => entry.id === section.familyId)?.notes ?? section.description
            : section.description,
          catalogEntry: section.familyId
            ? catalog.find((entry) => entry.id === section.familyId) ?? null
            : null,
        }));

      return { group, sections };
    })
    .filter(({ sections }) => sections.length > 0);
}
