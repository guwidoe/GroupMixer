import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ConstraintFamilyNavItem } from './ConstraintFamilyNav';
import { ConstraintFamilyNav } from './ConstraintFamilyNav';

interface ConstraintFamilyPanelProps {
  title: string;
  infoTitle: string;
  infoContent: React.ReactNode;
  showInfo: boolean;
  onToggleInfo: () => void;
  families?: ConstraintFamilyNavItem[];
  activeFamilyId?: string;
  onChangeFamily?: (familyId: string) => void;
  children: React.ReactNode;
}

export function ConstraintFamilyPanel({
  title,
  infoTitle,
  infoContent,
  showInfo,
  onToggleInfo,
  families,
  activeFamilyId,
  onChangeFamily,
  children,
}: ConstraintFamilyPanelProps) {
  return (
    <div className="space-y-4 pt-0 pl-0">
      <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>

      <div
        className="rounded-md border"
        style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 p-4 text-left"
          onClick={onToggleInfo}
        >
          {showInfo ? (
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {infoTitle}
          </h4>
        </button>
        {showInfo && <div className="p-4 pt-0 text-sm" style={{ color: 'var(--text-secondary)' }}>{infoContent}</div>}
      </div>

      {families && families.length > 0 && activeFamilyId && onChangeFamily ? (
        <ConstraintFamilyNav items={families} activeItemId={activeFamilyId} onChange={onChangeFamily} />
      ) : null}

      {children}
    </div>
  );
}
