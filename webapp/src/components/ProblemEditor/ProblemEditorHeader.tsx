import React from 'react';
import { Save, Upload } from 'lucide-react';
import { DemoDataDropdown } from './DemoDataDropdown';

interface ProblemEditorHeaderProps {
  onLoadProblem: () => void;
  onSaveProblem: () => void;
  onDemoCaseClick: (demoCaseId: string, demoCaseName: string) => void;
}

export function ProblemEditorHeader({
  onLoadProblem,
  onSaveProblem,
  onDemoCaseClick,
}: ProblemEditorHeaderProps) {
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onLoadProblem}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Upload className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <span className="truncate">Load</span>
      </button>

      <button
        type="button"
        onClick={onSaveProblem}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Save className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <span className="truncate">Save</span>
      </button>

      <DemoDataDropdown
        onDemoCaseClick={onDemoCaseClick}
        variant="sidebar"
        placement="right"
      />
    </div>
  );
}
