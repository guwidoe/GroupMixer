import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ProblemSetupSectionGroupDefinition, ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';
import type { ProblemSetupResolvedSection } from '../navigation/problemSetupNav';
import { ProblemSetupSidebarItem } from './ProblemSetupSidebarItem';

interface ProblemSetupSidebarGroupProps {
  group: ProblemSetupSectionGroupDefinition;
  sections: ProblemSetupResolvedSection[];
  activeSection: ProblemSetupSectionId | null;
  isRailCollapsed: boolean;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
}

export function ProblemSetupSidebarGroup({
  group,
  sections,
  activeSection,
  isRailCollapsed,
  onNavigate,
}: ProblemSetupSidebarGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="space-y-1" aria-label={group.label}>
      {!isRailCollapsed && (
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
          style={{ color: 'var(--text-tertiary)' }}
          aria-expanded={isExpanded}
          aria-controls={`problem-setup-group-${group.id}`}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.12em]">{group.label}</span>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      )}

      {(isRailCollapsed || isExpanded) && (
        <div
          id={`problem-setup-group-${group.id}`}
          className={`space-y-1 ${isRailCollapsed ? 'border-l pl-2' : ''}`}
          style={isRailCollapsed ? { borderColor: 'var(--border-primary)' } : undefined}
        >
          {sections.map((section) => (
            <ProblemSetupSidebarItem
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              isCollapsed={isRailCollapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
