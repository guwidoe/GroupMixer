import React, { useState } from 'react';
import { ScrollArea } from '../../ScrollArea';
import { WorkspaceMobileNav } from './WorkspaceMobileNav';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { WorkspaceNavGroup } from './types';

interface WorkspaceLayoutProps {
  workspaceLabel: string;
  groupedItems: WorkspaceNavGroup[];
  activeItemId: string | null;
  onNavigate: (itemId: string) => void;
  sidebarHeader?: React.ReactNode;
  collapsedSidebarHeader?: React.ReactNode;
  children: React.ReactNode;
}

function getWorkspacePersistenceNamespace(workspaceLabel: string) {
  return workspaceLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function readWorkspaceStorageValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeWorkspaceStorageValue<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore persistence failures
  }
}

export function WorkspaceLayout({
  workspaceLabel,
  groupedItems,
  activeItemId,
  onNavigate,
  sidebarHeader,
  collapsedSidebarHeader,
  children,
}: WorkspaceLayoutProps) {
  const persistenceNamespace = React.useMemo(
    () => getWorkspacePersistenceNamespace(workspaceLabel),
    [workspaceLabel],
  );
  const sidebarCollapsedStorageKey = `groupmixer.workspace.${persistenceNamespace}.sidebar-collapsed.v1`;
  const groupExpandedStorageKey = `groupmixer.workspace.${persistenceNamespace}.group-expanded.v1`;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() =>
    readWorkspaceStorageValue<boolean>(sidebarCollapsedStorageKey, false),
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    readWorkspaceStorageValue<Record<string, boolean>>(groupExpandedStorageKey, {}),
  );

  const handleToggleSidebarCollapsed = React.useCallback(() => {
    setIsSidebarCollapsed((value) => {
      const nextValue = !value;
      writeWorkspaceStorageValue(sidebarCollapsedStorageKey, nextValue);
      return nextValue;
    });
  }, [sidebarCollapsedStorageKey]);

  const handleToggleGroupExpanded = React.useCallback((groupId: string) => {
    setExpandedGroups((current) => {
      const nextValue = !(current[groupId] ?? true);
      const nextState = {
        ...current,
        [groupId]: nextValue,
      };
      writeWorkspaceStorageValue(groupExpandedStorageKey, nextState);
      return nextState;
    });
  }, [groupExpandedStorageKey]);

  return (
    <div className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0">
      <WorkspaceMobileNav
        workspaceLabel={workspaceLabel}
        groupedItems={groupedItems}
        activeItemId={activeItemId}
        expandedGroups={expandedGroups}
        onToggleGroupExpanded={handleToggleGroupExpanded}
        onNavigate={onNavigate}
        headerContent={sidebarHeader}
      />

      <div className="flex flex-col gap-6 md:min-h-0 md:flex-1 md:flex-row md:items-stretch md:gap-0">
        <WorkspaceSidebar
          workspaceLabel={workspaceLabel}
          groupedItems={groupedItems}
          activeItemId={activeItemId}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={handleToggleSidebarCollapsed}
          expandedGroups={expandedGroups}
          onToggleGroupExpanded={handleToggleGroupExpanded}
          onNavigate={onNavigate}
          headerContent={sidebarHeader}
          collapsedHeaderContent={collapsedSidebarHeader}
        />

        <ScrollArea orientation="vertical" className="min-w-0 flex-1 p-4 md:h-full md:min-h-0 md:p-6">
          {children}
        </ScrollArea>
      </div>
    </div>
  );
}
