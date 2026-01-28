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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Problem Setup</h2>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          Configure people, groups, and constraints for optimization
        </p>
      </div>
      <div className="w-full overflow-x-auto">
        <div className="flex flex-row flex-nowrap gap-2 justify-end w-full overflow-visible">
          <button
            onClick={onLoadProblem}
            className="flex items-center gap-1 sm:gap-2 justify-center px-1.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors btn-secondary min-w-0 text-xs sm:text-sm focus-visible:outline-none"
            style={{ outline: 'none', boxShadow: 'none' }}
          >
            <Upload className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="truncate">Load</span>
          </button>
          <button
            onClick={onSaveProblem}
            className="flex items-center gap-1 sm:gap-2 justify-center px-1.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors btn-secondary min-w-0 text-xs sm:text-sm focus-visible:outline-none"
            style={{ outline: 'none', boxShadow: 'none' }}
          >
            <Save className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="truncate">Save</span>
          </button>
          <DemoDataDropdown onDemoCaseClick={onDemoCaseClick} />
        </div>
      </div>
    </div>
  );
}
