import React from 'react';
import type { AttributeDefinition, Problem } from '../../../types';
import {
  getResolvedProblemSetupSectionsByGroup,
} from '../navigation/problemSetupNav';
import type { ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';
import { ProblemSetupMobileNav } from './ProblemSetupMobileNav';
import { ProblemSetupSidebar } from './ProblemSetupSidebar';

interface ProblemSetupLayoutProps {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  objectiveCount: number;
  activeSection: ProblemSetupSectionId | null;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
  children: React.ReactNode;
}

export function ProblemSetupLayout({
  problem,
  attributeDefinitions,
  objectiveCount,
  activeSection,
  onNavigate,
  children,
}: ProblemSetupLayoutProps) {
  const groupedSections = getResolvedProblemSetupSectionsByGroup(
    {
      problem,
      attributeDefinitions,
      objectiveCount,
    },
    { surface: 'sidebar' },
  );

  return (
    <div className="space-y-4">
      <ProblemSetupMobileNav
        groupedSections={groupedSections}
        activeSection={activeSection}
        onNavigate={onNavigate}
      />

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <ProblemSetupSidebar
          groupedSections={groupedSections}
          activeSection={activeSection}
          onNavigate={onNavigate}
        />

        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
