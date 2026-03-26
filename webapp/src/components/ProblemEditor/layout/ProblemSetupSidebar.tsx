import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ProblemSetupResolvedSection } from '../navigation/problemSetupNav';
import type { ProblemSetupSectionGroupDefinition, ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';
import { ProblemSetupSidebarGroup } from './ProblemSetupSidebarGroup';

interface ProblemSetupSidebarProps {
  groupedSections: Array<{
    group: ProblemSetupSectionGroupDefinition;
    sections: ProblemSetupResolvedSection[];
  }>;
  activeSection: ProblemSetupSectionId | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
}

export function ProblemSetupSidebar({
  groupedSections,
  activeSection,
  isCollapsed,
  onToggleCollapsed,
  onNavigate,
}: ProblemSetupSidebarProps) {
  return (
    <aside
      className={`hidden overflow-hidden border-r transition-[width] duration-200 ease-out md:flex md:flex-shrink-0 ${
        isCollapsed ? 'md:w-14' : 'md:w-64 lg:w-72'
      }`}
      style={{ borderColor: 'var(--border-primary)' }}
      aria-label="Problem Setup navigation"
    >
      <div className="sticky top-0 flex h-[calc(100vh-7rem)] w-full flex-col">
        <div className={`flex items-center border-b px-2 py-2 ${isCollapsed ? 'justify-center' : 'justify-between'}`} style={{ borderColor: 'var(--border-primary)' }}>
          {!isCollapsed && (
            <div className="px-1">
              <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
                Sections
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {groupedSections.map(({ group, sections }) => (
            <ProblemSetupSidebarGroup
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
            aria-label={isCollapsed ? 'Expand problem setup sidebar' : 'Collapse problem setup sidebar'}
            title={isCollapsed ? 'Expand problem setup sidebar' : 'Collapse problem setup sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
