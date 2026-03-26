import React, { useState } from 'react';
import { ScrollArea } from '../../ScrollArea';
import type { AttributeDefinition, Scenario } from '../../../types';
import { getResolvedScenarioSetupSectionsByGroup } from '../navigation/scenarioSetupNav';
import type { ScenarioSetupSectionId } from '../navigation/scenarioSetupNavTypes';
import { ScenarioSetupMobileNav } from './ScenarioSetupMobileNav';
import { ScenarioSetupSidebar } from './ScenarioSetupSidebar';

interface ScenarioSetupLayoutProps {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  objectiveCount: number;
  activeSection: ScenarioSetupSectionId | null;
  onNavigate: (sectionId: ScenarioSetupSectionId) => void;
  sidebarHeader?: React.ReactNode;
  collapsedSidebarHeader?: React.ReactNode;
  children: React.ReactNode;
}

export function ScenarioSetupLayout({
  scenario,
  attributeDefinitions,
  objectiveCount,
  activeSection,
  onNavigate,
  sidebarHeader,
  collapsedSidebarHeader,
  children,
}: ScenarioSetupLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const groupedSections = getResolvedScenarioSetupSectionsByGroup(
    {
      scenario,
      attributeDefinitions,
      objectiveCount,
    },
    { surface: 'sidebar' },
  );

  return (
    <div className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0">
      <ScenarioSetupMobileNav
        groupedSections={groupedSections}
        activeSection={activeSection}
        onNavigate={onNavigate}
        headerContent={sidebarHeader}
      />

      <div className="flex flex-col gap-6 md:min-h-0 md:flex-1 md:flex-row md:items-stretch md:gap-0">
        <ScenarioSetupSidebar
          groupedSections={groupedSections}
          activeSection={activeSection}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
          onNavigate={onNavigate}
          headerContent={sidebarHeader}
          collapsedHeaderContent={collapsedSidebarHeader}
        />

        <ScrollArea orientation="vertical" className="min-w-0 flex-1 p-4 md:h-full md:min-h-0 md:p-6">
          {children}
        </ScrollArea>
      </div>
    </div>
  );
}
