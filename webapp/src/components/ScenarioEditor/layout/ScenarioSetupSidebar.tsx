import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ScenarioSetupResolvedSection } from '../navigation/scenarioSetupNav';
import type { ScenarioSetupSectionGroupDefinition, ScenarioSetupSectionId } from '../navigation/scenarioSetupNavTypes';
import { ScenarioSetupSidebarGroup } from './ScenarioSetupSidebarGroup';

interface ScenarioSetupSidebarProps {
  groupedSections: Array<{
    group: ScenarioSetupSectionGroupDefinition;
    sections: ScenarioSetupResolvedSection[];
  }>;
  activeSection: ScenarioSetupSectionId | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: (sectionId: ScenarioSetupSectionId) => void;
  headerContent?: React.ReactNode;
  collapsedHeaderContent?: React.ReactNode;
}

export function ScenarioSetupSidebar({
  groupedSections,
  activeSection,
  isCollapsed,
  onToggleCollapsed,
  onNavigate,
  headerContent,
  collapsedHeaderContent,
}: ScenarioSetupSidebarProps) {
  return (
    <aside
      className={`hidden overflow-hidden border-r transition-[width] duration-200 ease-out md:flex md:flex-shrink-0 ${
        isCollapsed ? 'md:w-14' : 'md:w-64'
      }`}
      style={{ borderColor: 'var(--border-primary)' }}
      aria-label="Scenario Setup navigation"
    >
      <div className="flex h-full min-h-0 w-full flex-col">
        {!isCollapsed && headerContent && (
          <div className="border-b px-3 py-3" style={{ borderColor: 'var(--border-primary)' }}>
            {headerContent}
          </div>
        )}

        {isCollapsed && collapsedHeaderContent && (
          <div className="border-b px-1 py-2" style={{ borderColor: 'var(--border-primary)' }}>
            {collapsedHeaderContent}
          </div>
        )}

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {groupedSections.map(({ group, sections }) => (
            <ScenarioSetupSidebarGroup
              key={group.id}
              group={group}
              sections={sections}
              activeSection={activeSection}
              isRailCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className="border-t p-2" style={{ borderColor: 'var(--border-primary)' }}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex w-full items-center justify-center rounded-md py-1.5 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={isCollapsed ? 'Expand scenario setup sidebar' : 'Collapse scenario setup sidebar'}
            title={isCollapsed ? 'Expand scenario setup sidebar' : 'Collapse scenario setup sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
