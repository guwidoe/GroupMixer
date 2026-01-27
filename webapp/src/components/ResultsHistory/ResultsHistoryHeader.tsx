import React from 'react';
import { GitCompare, Trash2 } from 'lucide-react';

interface ResultsHistoryHeaderProps {
  resultsCount: number;
  currentProblemName: string;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onCompareSelected: () => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

export function ResultsHistoryHeader({
  resultsCount,
  currentProblemName,
  selectedCount,
  totalCount,
  onSelectAll,
  onCompareSelected,
  onBulkDelete,
  onClearSelection,
}: ResultsHistoryHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Results History</h2>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          {resultsCount} result{resultsCount !== 1 ? 's' : ''} for "{currentProblemName}"
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {resultsCount > 0 && (
          <button onClick={onSelectAll} className="btn-secondary text-sm w-full sm:w-auto">
            {selectedCount === totalCount ? 'Clear Selection' : 'Select All'}
          </button>
        )}
        {selectedCount > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm w-full sm:w-auto" style={{ color: 'var(--text-secondary)' }}>
            <span className="text-center sm:text-left">{selectedCount} selected</span>
            <div className="flex flex-col sm:flex-row gap-2">
              {selectedCount >= 2 && (
                <button
                  onClick={onCompareSelected}
                  className="btn-primary flex items-center justify-center sm:justify-start space-x-2"
                >
                  <GitCompare className="h-4 w-4" />
                  <span>Compare</span>
                </button>
              )}
              <button
                onClick={onBulkDelete}
                className="btn-danger flex items-center justify-center sm:justify-start space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete {selectedCount > 1 ? `${selectedCount} Results` : 'Result'}</span>
              </button>
              <button onClick={onClearSelection} className="btn-secondary">Clear</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
