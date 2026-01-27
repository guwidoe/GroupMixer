import React from 'react';
import { Download, ChevronDown, LayoutGrid, FileText, FileSpreadsheet } from 'lucide-react';

interface ResultsExportDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  onExportResult: (format: 'json' | 'csv' | 'excel') => void;
  onExportVisualizationPng: () => void;
  viewMode: 'grid' | 'list' | 'visualize';
  dropdownRef: React.RefObject<HTMLDivElement>;
}

export function ResultsExportDropdown({
  isOpen,
  onToggle,
  onExportResult,
  onExportVisualizationPng,
  viewMode,
  dropdownRef,
}: ResultsExportDropdownProps) {
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="btn-secondary flex items-center gap-2 justify-center sm:justify-start"
      >
        <Download className="h-4 w-4" />
        <span>Export</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 mt-1 min-w-full w-40 rounded-md shadow-lg z-10 border overflow-hidden"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          {viewMode === 'visualize' && (
            <button
              onClick={onExportVisualizationPng}
              className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
              style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <LayoutGrid className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>Export viz as PNG</span>
            </button>
          )}
          <button
            onClick={() => onExportResult('json')}
            className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
            style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Export as JSON</span>
          </button>
          <button
            onClick={() => onExportResult('csv')}
            className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
            style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Export as CSV</span>
          </button>
          <button
            onClick={() => onExportResult('excel')}
            className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
            style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Export as Excel</span>
          </button>
        </div>
      )}
    </div>
  );
}
