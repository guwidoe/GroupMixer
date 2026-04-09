import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ScrollArea } from '../../ScrollArea';
import { Tooltip } from '../../Tooltip';
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
  const [isToggleHovered, setIsToggleHovered] = useState(false);

  return (
    <aside
      className={`hidden border-r transition-[width] duration-200 ease-out md:flex md:min-h-0 md:flex-shrink-0 ${
        isCollapsed ? 'md:w-14' : 'md:w-56'
      }`}
      style={{ borderColor: 'var(--border-primary)' }}
      aria-label="Scenario Setup navigation"
    >
      <div className="flex h-full min-h-0 max-h-full w-full flex-col overflow-hidden">
        {!isCollapsed && headerContent && (
          <div className="shrink-0 border-b px-3 py-2" style={{ borderColor: 'var(--border-primary)' }}>
            {headerContent}
          </div>
        )}

        {isCollapsed && collapsedHeaderContent && (
          <div className="shrink-0 border-b px-1 py-2" style={{ borderColor: 'var(--border-primary)' }}>
            {collapsedHeaderContent}
          </div>
        )}

        <ScrollArea orientation="vertical" className="min-h-0 flex-1">
          <nav className="flex min-h-full flex-col px-0 pb-0 pt-2">
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
        </ScrollArea>

        <div className="shrink-0 border-t p-2" style={{ borderColor: 'var(--border-primary)' }}>
          <Tooltip
            content={isCollapsed ? 'Expand scenario setup sidebar' : 'Collapse scenario setup sidebar'}
            className="block w-full"
            placement="right"
          >
            <button
              type="button"
              onClick={onToggleCollapsed}
              onMouseEnter={() => setIsToggleHovered(true)}
              onMouseLeave={() => setIsToggleHovered(false)}
              className="flex w-full items-center justify-center rounded-md py-1.5 transition-colors duration-150"
              style={{
                color: isToggleHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isToggleHovered ? 'color-mix(in srgb, var(--bg-tertiary) 72%, transparent)' : 'transparent',
              }}
              aria-label={isCollapsed ? 'Expand scenario setup sidebar' : 'Collapse scenario setup sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
