import React, { useState } from 'react';
import type { AttributeDefinition, Problem } from '../../../types';
import { getResolvedProblemSetupSectionsByGroup } from '../navigation/problemSetupNav';
import type { ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';
import { ProblemSetupMobileNav } from './ProblemSetupMobileNav';
import { ProblemSetupSidebar } from './ProblemSetupSidebar';

interface ProblemSetupLayoutProps {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  objectiveCount: number;
  activeSection: ProblemSetupSectionId | null;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
  contentHeader?: React.ReactNode;
  children: React.ReactNode;
}

export function ProblemSetupLayout({
  problem,
  attributeDefinitions,
  objectiveCount,
  activeSection,
  onNavigate,
  contentHeader,
  children,
}: ProblemSetupLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <ProblemSetupSidebar
          groupedSections={groupedSections}
          activeSection={activeSection}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
          onNavigate={onNavigate}
        />

        <div className="min-w-0 flex-1 space-y-6">
          {contentHeader}
          {children}
        </div>
      </div>
    </div>
  );
}
