import React from 'react';
import type { SolverWorkspaceController } from './useSolverWorkspaceController';
import { RunSolverSection } from './sections/RunSolverSection';
import { SolverFamilySection } from './sections/SolverFamilySection';

export function renderSolverWorkspaceSection(controller: SolverWorkspaceController) {
  if (controller.activeSection === 'run') {
    return <RunSolverSection />;
  }

  const activeSection = controller.groupedSections
    .flatMap((group) => group.sections)
    .find((section) => section.id === controller.activeSection);

  if (!activeSection) {
    return <RunSolverSection />;
  }

  return <SolverFamilySection section={activeSection} />;
}
