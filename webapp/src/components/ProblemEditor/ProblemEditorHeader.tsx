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
    <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between" style={{ borderColor: 'var(--border-primary)' }}>
      <div className="min-w-0">
        <h2 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Problem Setup
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          Configure the workshop model, define rules, and tune optimization goals.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <button
          onClick={onLoadProblem}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors btn-secondary focus-visible:outline-none"
          style={{ outline: 'none', boxShadow: 'none' }}
        >
          <Upload className="h-4 w-4 flex-shrink-0" />
          <span>Load</span>
        </button>
        <button
          onClick={onSaveProblem}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors btn-secondary focus-visible:outline-none"
          style={{ outline: 'none', boxShadow: 'none' }}
        >
          <Save className="h-4 w-4 flex-shrink-0" />
          <span>Save</span>
        </button>
        <DemoDataDropdown onDemoCaseClick={onDemoCaseClick} />
      </div>
    </div>
  );
}
