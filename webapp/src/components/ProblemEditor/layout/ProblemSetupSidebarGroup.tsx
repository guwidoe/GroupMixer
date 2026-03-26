import React from 'react';
import type { ProblemSetupSectionGroupDefinition, ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';
import type { ProblemSetupResolvedSection } from '../navigation/problemSetupNav';
import { ProblemSetupSidebarItem } from './ProblemSetupSidebarItem';

interface ProblemSetupSidebarGroupProps {
  group: ProblemSetupSectionGroupDefinition;
  sections: ProblemSetupResolvedSection[];
  activeSection: ProblemSetupSectionId | null;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
}

export function ProblemSetupSidebarGroup({
  group,
  sections,
  activeSection,
  onNavigate,
}: ProblemSetupSidebarGroupProps) {
  return (
    <section className="space-y-2" aria-label={group.label}>
      <div className="px-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          {group.label}
        </h3>
        <p className="mt-1 text-xs leading-4" style={{ color: 'var(--text-tertiary)' }}>
          {group.description}
        </p>
      </div>

      <div className="space-y-1">
        {sections.map((section) => (
          <ProblemSetupSidebarItem
            key={section.id}
            section={section}
            isActive={activeSection === section.id}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}
