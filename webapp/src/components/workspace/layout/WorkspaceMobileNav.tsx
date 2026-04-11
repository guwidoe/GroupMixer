import React, { useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ScrollArea } from '../../ScrollArea';
import type { WorkspaceNavGroup } from './types';
import { WorkspaceSidebarGroup } from './WorkspaceSidebarGroup';

interface WorkspaceMobileNavProps {
  workspaceLabel: string;
  groupedItems: WorkspaceNavGroup[];
  activeItemId: string | null;
  onNavigate: (itemId: string) => void;
  headerContent?: React.ReactNode;
}

export function WorkspaceMobileNav({
  workspaceLabel,
  groupedItems,
  activeItemId,
  onNavigate,
  headerContent,
}: WorkspaceMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeLabel = useMemo(() => {
    for (const group of groupedItems) {
      const match = group.items.find((item) => item.id === activeItemId);
      if (match) {
        return match.shortLabel ?? match.label;
      }
    }

    return 'Choose section';
  }, [activeItemId, groupedItems]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        aria-expanded={isOpen}
        aria-label={`Open ${workspaceLabel.toLowerCase()} navigation`}
      >
        <div className="flex items-center gap-3">
          <Menu className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              {workspaceLabel}
            </div>
            <div className="mt-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {activeLabel}
            </div>
          </div>
        </div>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={`${workspaceLabel} navigation drawer`}>
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
            aria-label={`Close ${workspaceLabel.toLowerCase()} navigation`}
            onClick={() => setIsOpen(false)}
          />

          <ScrollArea
            orientation="vertical"
            className="absolute inset-y-0 left-0 w-[80vw] max-w-xs border-r shadow-xl"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-primary)' }}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
                {workspaceLabel}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-2"
                aria-label={`Close ${workspaceLabel.toLowerCase()} navigation`}
              >
                <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            {headerContent ? (
              <div className="border-b px-4 py-4" style={{ borderColor: 'var(--border-primary)' }}>
                {headerContent}
              </div>
            ) : null}

            <div className="px-4 py-3">
              {groupedItems.map((group) => (
                <WorkspaceSidebarGroup
                  key={group.id}
                  group={group}
                  activeItemId={activeItemId}
                  isRailCollapsed={false}
                  onNavigate={(itemId) => {
                    onNavigate(itemId);
                    setIsOpen(false);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
