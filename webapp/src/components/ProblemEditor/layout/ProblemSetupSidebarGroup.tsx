import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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

  if (isRailCollapsed) {
    return (
      <section className="mt-3 flex flex-col gap-0.5" aria-label={group.label}>
        <div className="mx-auto mb-1 h-px w-4" style={{ backgroundColor: 'var(--border-primary)' }} />
        {sections.map((section) => (
          <ProblemSetupSidebarItem
            key={section.id}
            section={section}
            isActive={activeSection === section.id}
            isCollapsed
            onNavigate={onNavigate}
          />
        ))}
      </section>
    );
  }

  return (
    <section className="mt-3" aria-label={group.label}>
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full items-center justify-between px-2.5 py-1 text-left transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-expanded={isExpanded}
        aria-controls={`problem-setup-group-${group.id}`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{group.label}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`} />
      </button>

      {isExpanded && (
        <div id={`problem-setup-group-${group.id}`} className="mt-0.5 flex flex-col gap-0.5">
          {sections.map((section) => (
            <ProblemSetupSidebarItem
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              isCollapsed={false}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
