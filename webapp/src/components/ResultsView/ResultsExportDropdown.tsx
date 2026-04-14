import React from 'react';
import { ChevronDown, Download, FileJson2, FileSpreadsheet, LayoutGrid, Users, UsersRound } from 'lucide-react';
import type { ResultExportAction } from '../../utils/csvExport';

interface ResultsExportDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  onExportAction: (action: ResultExportAction) => void;
  onExportVisualizationPng: () => void;
  viewMode: 'grid' | 'list' | 'visualize';
  dropdownRef: React.RefObject<HTMLDivElement>;
}

export function ResultsExportDropdown({
  isOpen,
  onToggle,
  onExportAction,
  onExportVisualizationPng,
  viewMode,
  dropdownRef,
}: ResultsExportDropdownProps) {
  const sectionTitleClassName = 'px-4 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em]';
  const actionClassName = 'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors';

  const renderAction = (
    icon: React.ReactNode,
    title: string,
    description: string,
    onClick: () => void,
  ) => (
    <button
      onClick={onClick}
      className={actionClassName}
      style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <span
        className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--color-accent)' }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>{description}</span>
      </span>
    </button>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="btn-secondary flex items-center gap-2 justify-center sm:justify-start"
      >
        <Download className="h-4 w-4" />
        <span>Share &amp; Export</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-10 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-lg"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          {viewMode === 'visualize' && (
            <>
              <div className={sectionTitleClassName} style={{ color: 'var(--text-tertiary)' }}>
                Quick use
              </div>
              {renderAction(
                <LayoutGrid className="h-4 w-4" />,
                'Save current view as PNG',
                'Capture the active visualization as an image for slides, docs, or chat.',
                onExportVisualizationPng,
              )}
            </>
          )}

          <div className={sectionTitleClassName} style={{ color: 'var(--text-tertiary)' }}>
            Structured files
          </div>
          {renderAction(
            <FileJson2 className="h-4 w-4" />,
            'Download result snapshot',
            'JSON bundle with scenario inputs, solver output, and result metadata.',
            () => onExportAction('json-result-bundle'),
          )}
          {renderAction(
            <FileSpreadsheet className="h-4 w-4" />,
            'Download spreadsheet-ready schedule',
            'Excel-compatible file with one row per assignment.',
            () => onExportAction('excel-full-schedule'),
          )}
          {renderAction(
            <FileSpreadsheet className="h-4 w-4" />,
            'Download raw schedule rows',
            'CSV for analysis pipelines or custom spreadsheet work.',
            () => onExportAction('csv-full-schedule'),
          )}

          <div className={sectionTitleClassName} style={{ color: 'var(--text-tertiary)' }}>
            Audience-ready downloads
          </div>
          {renderAction(
            <UsersRound className="h-4 w-4" />,
            'Download session rosters',
            'Grouped session and group rosters for room leads and facilitators.',
            () => onExportAction('csv-session-rosters'),
          )}
          {renderAction(
            <Users className="h-4 w-4" />,
            'Download participant itineraries',
            'One row per person with their full session-by-session assignment path.',
            () => onExportAction('csv-participant-itineraries'),
          )}

          {viewMode === 'visualize' && (
            <div className="px-4 pb-4 pt-3 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
              Current-view exports are only available while a visualization is visible.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
