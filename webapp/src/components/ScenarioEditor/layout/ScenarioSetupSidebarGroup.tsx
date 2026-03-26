import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Tooltip } from '../../Tooltip';
import type { ScenarioSetupSectionGroupDefinition, ScenarioSetupSectionId } from '../navigation/scenarioSetupNavTypes';
import type { ScenarioSetupResolvedSection } from '../navigation/scenarioSetupNav';
import { ScenarioSetupSidebarItem } from './ScenarioSetupSidebarItem';

interface ScenarioSetupSidebarGroupProps {
  group: ScenarioSetupSectionGroupDefinition;
  sections: ScenarioSetupResolvedSection[];
  activeSection: ScenarioSetupSectionId | null;
  isRailCollapsed: boolean;
  onNavigate: (sectionId: ScenarioSetupSectionId) => void;
}

export function ScenarioSetupSidebarGroup({
  group,
  sections,
  activeSection,
  isRailCollapsed,
  onNavigate,
}: ScenarioSetupSidebarGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isRailCollapsed) {
    return (
      <section className="mt-3 flex flex-col gap-0.5 first:mt-2" aria-label={group.label}>
        <div className="mx-auto mb-1 h-px w-4" style={{ backgroundColor: 'var(--border-primary)' }} />
        {sections.map((section) => (
          <ScenarioSetupSidebarItem
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
    <section className="mt-3 first:mt-2" aria-label={group.label}>
      <Tooltip content={group.label} className="block w-full" placement="right">
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex w-full items-center justify-between px-[1.375rem] py-1 text-left transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
          aria-expanded={isExpanded}
          aria-controls={`scenario-setup-group-${group.id}`}
          aria-label={group.label}
        >
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]">{group.label}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`} />
        </button>
      </Tooltip>

      {isExpanded && (
        <div id={`scenario-setup-group-${group.id}`} className="mt-0.5 flex flex-col gap-0.5">
          {sections.map((section) => (
            <ScenarioSetupSidebarItem
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
