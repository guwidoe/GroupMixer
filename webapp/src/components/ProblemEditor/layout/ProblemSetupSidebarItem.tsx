import React from 'react';
import type { ProblemSetupResolvedSection } from '../navigation/problemSetupNav';
import type { ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';

interface ProblemSetupSidebarItemProps {
  section: ProblemSetupResolvedSection;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
}

export function ProblemSetupSidebarItem({
  section,
  isActive,
  isCollapsed,
  onNavigate,
}: ProblemSetupSidebarItemProps) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => onNavigate(section.id)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={section.label}
      title={isCollapsed ? section.label : undefined}
      className={`relative w-full rounded-lg transition-colors ${isCollapsed ? 'px-2 py-3' : 'px-3 py-2 text-left'}`}
      style={{
        backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
        color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
      }}
    >
      <div className={`flex ${isCollapsed ? 'justify-center' : 'items-center justify-between gap-2'}`}>
        <div className={`flex min-w-0 items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
          <Icon className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && (
            <span className="truncate text-sm font-medium leading-5">{section.shortLabel ?? section.label}</span>
          )}
        </div>

        {!isCollapsed && typeof section.resolvedCount === 'number' && (
          <span
            className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
            }}
          >
            {section.resolvedCount}
          </span>
        )}
      </div>

      {isCollapsed && typeof section.resolvedCount === 'number' && (
        <span
          className="absolute right-1.5 top-1 rounded-full px-1 py-0 text-[10px] font-semibold leading-4"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
          }}
        >
          {section.resolvedCount}
        </span>
      )}
    </button>
  );
}
