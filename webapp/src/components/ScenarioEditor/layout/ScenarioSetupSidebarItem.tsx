import React, { useState } from 'react';
import { Tooltip } from '../../Tooltip';
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
  const [isHovered, setIsHovered] = useState(false);

  const showHoverState = isHovered && !isActive;
  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-semibold">{section.shortLabel ?? section.label}</div>
      {section.tooltipDescription ? (
        <div>{section.tooltipDescription}</div>
      ) : null}
    </div>
  );

  return (
    <Tooltip content={tooltipContent} className="block w-full" placement="right">
      <button
        type="button"
        onClick={() => onNavigate(section.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={section.shortLabel ?? section.label}
        className={`relative flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors duration-150 ${
          isCollapsed ? 'w-full justify-center px-0' : 'w-full px-[1.375rem] text-left'
        }`}
        style={{
          backgroundColor: isActive
            ? 'var(--bg-tertiary)'
            : showHoverState
              ? 'color-mix(in srgb, var(--bg-tertiary) 82%, transparent)'
              : 'transparent',
          color: isActive ? 'var(--color-accent)' : showHoverState ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        <Icon
          className="h-4 w-4 shrink-0"
          style={{
            color: isActive ? 'var(--color-accent)' : showHoverState ? 'var(--text-secondary)' : 'var(--text-tertiary)',
          }}
        />
        {!isCollapsed && <span className="truncate">{section.shortLabel ?? section.label}</span>}

        {typeof section.resolvedCount === 'number' && !isCollapsed && (
          <span
            className="ml-auto rounded-full px-1.5 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: isActive ? 'var(--color-accent)' : showHoverState ? 'var(--text-primary)' : 'var(--text-secondary)',
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
              color: isActive ? 'var(--color-accent)' : showHoverState ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            {section.resolvedCount}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
