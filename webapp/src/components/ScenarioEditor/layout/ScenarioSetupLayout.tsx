import React from 'react';
import type { AttributeDefinition, Scenario } from '../../../types';
import { WorkspaceLayout } from '../../workspace/layout/WorkspaceLayout';
import type { WorkspaceNavGroup } from '../../workspace/layout/types';
import { getResolvedScenarioSetupSectionsByGroup } from '../navigation/scenarioSetupNav';
import type { ScenarioSetupSectionId } from '../navigation/scenarioSetupNavTypes';

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
  const groupedSections = getResolvedScenarioSetupSectionsByGroup(
    {
      scenario,
      attributeDefinitions,
      objectiveCount,
    },
    { surface: 'sidebar' },
  );

  const groupedItems = React.useMemo<WorkspaceNavGroup[]>(
    () => groupedSections.map(({ group, sections }) => ({
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
        count: section.resolvedCount,
      })),
    })),
    [groupedSections],
  );

  return (
    <WorkspaceLayout
      workspaceLabel="Scenario Setup"
      groupedItems={groupedItems}
      activeItemId={activeSection}
      onNavigate={(sectionId) => onNavigate(sectionId as ScenarioSetupSectionId)}
      sidebarHeader={sidebarHeader}
      collapsedSidebarHeader={collapsedSidebarHeader}
    >
      {children}
    </WorkspaceLayout>
  );
}
