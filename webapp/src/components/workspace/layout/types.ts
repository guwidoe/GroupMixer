import type { LucideIcon } from 'lucide-react';

export interface WorkspaceNavItemBadge {
  label: string;
  tone?: 'neutral' | 'accent';
}

export interface WorkspaceNavItem {
  id: string;
  routeSegment?: string;
  label: string;
  shortLabel?: string;
  tooltipDescription?: string;
  icon: LucideIcon;
  count?: number;
  badge?: WorkspaceNavItemBadge;
}

export interface WorkspaceNavGroup {
  id: string;
  label: string;
  description?: string;
  items: WorkspaceNavItem[];
}
