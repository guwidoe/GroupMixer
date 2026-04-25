import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Tooltip } from '../../Tooltip';
import type { WorkspaceNavGroup } from './types';
import { WorkspaceSidebarItem } from './WorkspaceSidebarItem';

interface WorkspaceSidebarGroupProps {
  group: WorkspaceNavGroup;
  activeItemId: string | null;
  isRailCollapsed: boolean;
  isExpanded: boolean;
  onToggleExpanded: (groupId: string) => void;
  onNavigate: (itemId: string) => void;
}

export function WorkspaceSidebarGroup({
  group,
  activeItemId,
  isRailCollapsed,
  isExpanded,
  onToggleExpanded,
  onNavigate,
}: WorkspaceSidebarGroupProps) {
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  if (isRailCollapsed) {
    return (
      <section className="mt-3 flex flex-col gap-0.5 first:mt-2" aria-label={group.label}>
        <div className="mx-auto mb-1 h-px w-4" style={{ backgroundColor: 'var(--border-primary)' }} />
        {group.items.map((item) => (
          <WorkspaceSidebarItem
            key={item.id}
            item={item}
            isActive={activeItemId === item.id}
            isCollapsed
            onNavigate={onNavigate}
          />
        ))}
      </section>
    );
  }

  return (
    <section className="mt-3 first:mt-2" aria-label={group.label}>
      <Tooltip content={group.description ?? group.label} className="block w-full" placement="right">
        <button
          type="button"
          onClick={() => onToggleExpanded(group.id)}
          onMouseEnter={() => setIsHeaderHovered(true)}
          onMouseLeave={() => setIsHeaderHovered(false)}
          className="flex w-full items-center justify-between rounded-md px-[1.375rem] py-1 text-left transition-colors duration-150"
          style={{
            color: isHeaderHovered ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            backgroundColor: isHeaderHovered ? 'color-mix(in srgb, var(--bg-tertiary) 55%, transparent)' : 'transparent',
          }}
          aria-expanded={isExpanded}
          aria-controls={`workspace-group-${group.id}`}
          aria-label={group.label}
        >
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]">{group.label}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`} />
        </button>
      </Tooltip>

      {isExpanded ? (
        <div id={`workspace-group-${group.id}`} className="mt-0.5 flex flex-col gap-0.5">
          {group.items.map((item) => (
            <WorkspaceSidebarItem
              key={item.id}
              item={item}
              isActive={activeItemId === item.id}
              isCollapsed={false}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
