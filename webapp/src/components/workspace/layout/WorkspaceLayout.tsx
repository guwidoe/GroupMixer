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

export function WorkspaceLayout({
  workspaceLabel,
  groupedItems,
  activeItemId,
  onNavigate,
  sidebarHeader,
  collapsedSidebarHeader,
  children,
}: WorkspaceLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0">
      <WorkspaceMobileNav
        workspaceLabel={workspaceLabel}
        groupedItems={groupedItems}
        activeItemId={activeItemId}
        onNavigate={onNavigate}
        headerContent={sidebarHeader}
      />

      <div className="flex flex-col gap-6 md:min-h-0 md:flex-1 md:flex-row md:items-stretch md:gap-0">
        <WorkspaceSidebar
          workspaceLabel={workspaceLabel}
          groupedItems={groupedItems}
          activeItemId={activeItemId}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
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
