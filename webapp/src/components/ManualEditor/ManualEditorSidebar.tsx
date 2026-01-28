import React from 'react';
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react';

interface ManualEditorSidebarProps {
  avgUniqueContacts: number | null;
  totalViolations: number;
  hardViolationsCount: number;
  sessionCount: number;
  activeSession: number;
  onSelectSession: (sessionIndex: number) => void;
}

export function ManualEditorSidebar({
  avgUniqueContacts,
  totalViolations,
  hardViolationsCount,
  sessionCount,
  activeSession,
  onSelectSession,
}: ManualEditorSidebarProps) {
  return (
    <div className="w-full lg:w-64 flex-shrink-0 space-y-3">
      <div
        className="rounded-lg border p-3"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
          Live Metrics
        </div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex items-center justify-between py-1">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" /> Unique Contacts
            </span>
            <span>{avgUniqueContacts === null ? '-' : `${avgUniqueContacts.toFixed(1)} avg`}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Violations
            </span>
            <span>{totalViolations}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Hard Violations
            </span>
            <span>{hardViolationsCount}</span>
          </div>
        </div>
      </div>
      <div
        className="rounded-lg border p-3"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
          Session
        </div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: sessionCount }, (_, s) => (
            <button
              key={s}
              onClick={() => onSelectSession(s)}
              className="px-2 py-1 rounded text-xs border"
              style={{
                color: activeSession === s ? 'var(--color-accent)' : 'var(--text-secondary)',
                borderColor: activeSession === s ? 'var(--color-accent)' : 'var(--border-primary)',
                backgroundColor: activeSession === s ? 'var(--bg-tertiary)' : 'transparent',
              }}
            >
              {s + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
