import React from 'react';
import type { ProblemSetupResolvedSection } from '../navigation/problemSetupNav';
import type { ProblemSetupSectionGroupDefinition, ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';
import { ProblemSetupSidebarGroup } from './ProblemSetupSidebarGroup';

interface ProblemSetupSidebarProps {
  groupedSections: Array<{
    group: ProblemSetupSectionGroupDefinition;
    sections: ProblemSetupResolvedSection[];
  }>;
  activeSection: ProblemSetupSectionId | null;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
}

export function ProblemSetupSidebar({
  groupedSections,
  activeSection,
  onNavigate,
}: ProblemSetupSidebarProps) {
  return (
    <aside
      className="hidden md:block md:w-80 md:flex-shrink-0"
      aria-label="Problem Setup navigation"
    >
      <div
        className="sticky top-6 rounded-xl border p-4"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="mb-4 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Problem Setup
          </h2>
          <p className="mt-2 text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>
            Define the model first, then add rules and optimization goals.
          </p>
        </div>

        <div className="space-y-5">
          {groupedSections.map(({ group, sections }) => (
            <ProblemSetupSidebarGroup
              key={group.id}
              group={group}
              sections={sections}
              activeSection={activeSection}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
