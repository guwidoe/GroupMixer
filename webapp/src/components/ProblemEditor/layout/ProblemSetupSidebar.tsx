import React from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
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
      className={`hidden md:block md:flex-shrink-0 ${isCollapsed ? 'md:w-20' : 'md:w-64 lg:w-72'}`}
      aria-label="Problem Setup navigation"
    >
      <div
        className="sticky top-20 h-[calc(100vh-6rem)] overflow-y-auto border-r pr-3"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className={`mb-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3'} pt-1`}>
          {!isCollapsed && (
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Problem Setup
            </h2>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-2 transition-colors hover:bg-[var(--bg-primary)]"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={isCollapsed ? 'Expand problem setup sidebar' : 'Collapse problem setup sidebar'}
          >
            {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="space-y-4">
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
        </div>
      </div>
    </aside>
  );
}
