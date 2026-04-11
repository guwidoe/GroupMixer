import React from 'react';
import { WorkspaceLayout } from '../workspace/layout/WorkspaceLayout';
import type { WorkspaceNavGroup } from '../workspace/layout/types';
import { renderSolverWorkspaceSection } from './solverWorkspaceSectionRegistry';
import { useSolverWorkspaceController } from './useSolverWorkspaceController';

export function SolverWorkspace() {
  const controller = useSolverWorkspaceController();
  const groupedItems = React.useMemo<WorkspaceNavGroup[]>(
    () => controller.groupedSections.map(({ group, sections }) => ({
      id: group.id,
      label: group.label,
      description: group.description,
      items: sections.map((section) => ({
        id: section.id,
        routeSegment: section.routeSegment,
        label: section.label,
        shortLabel: section.shortLabel,
        tooltipDescription: section.tooltipDescription,
        icon: section.icon,
        badge: section.catalogEntry?.experimental ? { label: 'Experimental', tone: 'accent' } : undefined,
      })),
    })),
    [controller.groupedSections],
  );

  return (
    <WorkspaceLayout
      workspaceLabel="Solver"
      groupedItems={groupedItems}
      activeItemId={controller.activeSection}
      onNavigate={(sectionId) => controller.navigateToSection(sectionId as 'run' | 'solver1' | 'solver3')}
    >
      {renderSolverWorkspaceSection(controller)}
    </WorkspaceLayout>
  );
}
