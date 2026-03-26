import React from 'react';
import type { ScenarioSetupResolvedSection } from '../navigation/scenarioSetupNav';
import type { ScenarioSetupSectionId } from '../navigation/scenarioSetupNavTypes';

interface ScenarioSetupSidebarItemProps {
  section: ScenarioSetupResolvedSection;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate: (sectionId: ScenarioSetupSectionId) => void;
}

export function ScenarioSetupSidebarItem({
  section,
  isActive,
  isCollapsed,
  onNavigate,
}: ScenarioSetupSidebarItemProps) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => onNavigate(section.id)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={section.label}
      title={isCollapsed ? section.label : undefined}
      className={`relative flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors ${
        isCollapsed ? 'w-full justify-center px-0' : 'w-full px-2.5 text-left'
      }`}
      style={{
        backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
        color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
      }}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        style={{ color: isActive ? 'var(--color-accent)' : 'var(--text-tertiary)' }}
      />
      {!isCollapsed && <span className="truncate">{section.shortLabel ?? section.label}</span>}

      {typeof section.resolvedCount === 'number' && !isCollapsed && (
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
          }}
        >
          {section.resolvedCount}
        </span>
      )}

      {typeof section.resolvedCount === 'number' && isCollapsed && (
        <span
          className="absolute right-0.5 top-0.5 min-w-[1rem] rounded-full px-1 py-0 text-center text-[10px] font-semibold leading-4"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {section.resolvedCount}
        </span>
      )}
    </button>
  );
}
