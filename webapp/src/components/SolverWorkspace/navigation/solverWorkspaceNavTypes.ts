import type { LucideIcon } from 'lucide-react';
import type { SolverCatalogEntry, SolverFamilyId } from '../../../services/solverUi';

export type SolverWorkspaceSectionGroupId = 'run' | 'manual-tuning';
export type SolverWorkspaceSectionId = 'run' | 'solver1' | 'solver3';

export interface SolverWorkspaceSectionDefinition {
  id: SolverWorkspaceSectionId;
  routeSegment: SolverWorkspaceSectionId;
  label: string;
  shortLabel?: string;
  description: string;
  tooltipDescription?: string;
  group: SolverWorkspaceSectionGroupId;
  order: number;
  icon: LucideIcon;
  familyId?: Extract<SolverFamilyId, 'solver1' | 'solver3'>;
}

export interface SolverWorkspaceSectionGroupDefinition {
  id: SolverWorkspaceSectionGroupId;
  label: string;
  order: number;
  description: string;
}

export interface SolverWorkspaceResolvedSection extends SolverWorkspaceSectionDefinition {
  catalogEntry?: SolverCatalogEntry | null;
}
