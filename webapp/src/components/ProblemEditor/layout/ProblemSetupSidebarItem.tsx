import React from 'react';
import type { ProblemSetupResolvedSection } from '../navigation/problemSetupNav';
import type { ProblemSetupSectionId } from '../navigation/problemSetupNavTypes';

interface ProblemSetupSidebarItemProps {
  section: ProblemSetupResolvedSection;
  isActive: boolean;
  onNavigate: (sectionId: ProblemSetupSectionId) => void;
}

export function ProblemSetupSidebarItem({
  section,
  isActive,
  onNavigate,
}: ProblemSetupSidebarItemProps) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => onNavigate(section.id)}
      className="w-full rounded-lg border px-3 py-2 text-left transition-colors"
      style={{
        backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
        borderColor: isActive ? 'var(--color-accent)' : 'transparent',
        color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium leading-5">{section.shortLabel ?? section.label}</div>
            <div className="mt-1 text-xs leading-4" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              {section.description}
            </div>
          </div>
        </div>

        {typeof section.resolvedCount === 'number' && (
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
    </button>
  );
}
