import React from 'react';
import type { AttributeDefinition, Problem } from '../../types';
import {
  getProblemSetupSectionCount,
  getProblemSetupSections,
} from './navigation/problemSetupNav';
import type { ProblemSetupSectionId } from './navigation/problemSetupNavTypes';

interface ProblemEditorTabsProps {
  activeSection: string;
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  objectiveCount: number;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
}

export function ProblemEditorTabs({
  activeSection,
  problem,
  attributeDefinitions,
  objectiveCount,
  onNavigate,
}: ProblemEditorTabsProps) {
  const tabs = getProblemSetupSections({ surface: 'legacy-tabs' }).map((section) => ({
    id: section.id,
    label: section.shortLabel ?? section.label,
    icon: section.icon,
    count: getProblemSetupSectionCount(section, {
      problem,
      attributeDefinitions,
      objectiveCount,
    }),
  }));

  return (
    <div className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
      <nav className="flex flex-wrap justify-between gap-y-2">
        {tabs.map((tab) => (
          <button
            className={`flex-1 flex flex-row items-center justify-center min-w-[140px] gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${activeSection === tab.id ? 'bg-[var(--bg-tertiary)] text-[var(--color-accent)]' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--color-accent)]'}`}
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
          >
            <tab.icon className="w-5 h-5" />
            <span className="whitespace-nowrap">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{tab.count}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
