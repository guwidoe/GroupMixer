import React, { useState } from 'react';
import { Tooltip } from '../../Tooltip';
import type { WorkspaceNavItem } from './types';

interface WorkspaceSidebarItemProps {
  item: WorkspaceNavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate: (itemId: string) => void;
}

function resolveBadgeStyles(tone: WorkspaceNavItem['badge'] extends infer T ? T extends { tone?: infer Tone } ? Tone : never : never) {
  if (tone === 'accent') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
      color: 'var(--color-accent)',
      borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
    };
  }

  return {
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-primary)',
  };
}

export function WorkspaceSidebarItem({ item, isActive, isCollapsed, onNavigate }: WorkspaceSidebarItemProps) {
  const Icon = item.icon;
  const [isHovered, setIsHovered] = useState(false);
  const showHoverState = isHovered && !isActive;
  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-semibold">{item.shortLabel ?? item.label}</div>
      {item.tooltipDescription ? <div>{item.tooltipDescription}</div> : null}
    </div>
  );
  const badgeStyles = resolveBadgeStyles(item.badge?.tone);

  return (
    <Tooltip content={tooltipContent} className="block w-full" placement="right">
      <button
        type="button"
        onClick={() => onNavigate(item.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.shortLabel ?? item.label}
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

        {!isCollapsed && (
          <>
            <span className="truncate">{item.shortLabel ?? item.label}</span>

            {item.badge ? (
              <span
                className="ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
                style={badgeStyles}
              >
                {item.badge.label}
              </span>
            ) : null}

            {typeof item.count === 'number' ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: isActive ? 'var(--color-accent)' : showHoverState ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {item.count}
              </span>
            ) : null}
          </>
        )}

        {typeof item.count === 'number' && isCollapsed ? (
          <span
            className="absolute right-0.5 top-0.5 min-w-[1rem] rounded-full px-1 py-0 text-center text-[10px] font-semibold leading-4"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: isActive ? 'var(--color-accent)' : showHoverState ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            {item.count}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}
