import React from 'react';
import { Columns3, FileSpreadsheet, PencilLine } from 'lucide-react';
import type { Table } from '@tanstack/react-table';
import { Button } from '../../../../ui';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';

interface GridToolbarProps<T> {
  browseModeEnabled: boolean;
  canCreateRows: boolean;
  csvLabel: string;
  hasDraftCsvColumns: boolean;
  hasDraftEditing: boolean;
  hasEditableColumns: boolean;
  hasModeTabs: boolean;
  inlineCsvConfigPresent: boolean;
  isColumnsMenuOpen: boolean;
  isInlineCsvMode: boolean;
  onToggleColumnsMenu: () => void;
  onCloseColumnsMenu: () => void;
  onToggleCsv: () => void;
  onToggleEdit: () => void;
  onSelectBrowse: () => void;
  onDiscardChanges: () => void;
  onApplyChanges: () => void;
  onAddRow: () => void;
  resolvedWorkspaceActions: React.ReactNode;
  showCsvExport: boolean;
  showEditToggle: boolean;
  table: Table<T>;
  toolbarActions?: React.ReactNode;
  workspaceMode: 'browse' | 'edit' | 'csv';
}

export function GridToolbar<T>({
  browseModeEnabled,
  canCreateRows,
  csvLabel,
  hasDraftCsvColumns,
  hasDraftEditing,
  hasEditableColumns,
  hasModeTabs,
  inlineCsvConfigPresent,
  isColumnsMenuOpen,
  isInlineCsvMode,
  onToggleColumnsMenu,
  onCloseColumnsMenu,
  onToggleCsv,
  onToggleEdit,
  onSelectBrowse,
  onDiscardChanges,
  onApplyChanges,
  onAddRow,
  resolvedWorkspaceActions,
  showCsvExport,
  showEditToggle,
  table,
  toolbarActions,
  workspaceMode,
}: GridToolbarProps<T>) {
  const showCsvTab = hasDraftCsvColumns || inlineCsvConfigPresent;
  const showEditTab = showEditToggle && hasEditableColumns;

  const modeTabClassName = (active: boolean) => [
    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    active ? 'shadow-sm' : '',
  ].join(' ');

  return (
    <div className="flex border-b px-4 py-2.5 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {hasModeTabs ? (
          <div
            className="inline-flex items-center rounded-xl border p-1"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            role="toolbar"
            aria-label="Table view modes"
          >
            {browseModeEnabled ? (
              <button
                type="button"
                aria-label="View"
                aria-pressed={workspaceMode === 'browse'}
                className={modeTabClassName(workspaceMode === 'browse')}
                style={workspaceMode === 'browse'
                  ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-secondary)' }}
                onClick={onSelectBrowse}
              >
                View
              </button>
            ) : null}
            {showEditTab ? (
              <button
                type="button"
                aria-label="Edit table"
                aria-pressed={workspaceMode === 'edit'}
                className={modeTabClassName(workspaceMode === 'edit')}
                style={workspaceMode === 'edit'
                  ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-secondary)' }}
                onClick={onToggleEdit}
              >
                Edit
              </button>
            ) : null}
            {showCsvTab ? (
              <button
                type="button"
                aria-label={csvLabel}
                aria-pressed={workspaceMode === 'csv'}
                className={modeTabClassName(workspaceMode === 'csv')}
                style={workspaceMode === 'csv'
                  ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-secondary)' }}
                onClick={onToggleCsv}
              >
                CSV
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isInlineCsvMode ? (
          <div className="relative">
            <Button variant="secondary" size="sm" leadingIcon={<Columns3 className="h-4 w-4" />} onClick={onToggleColumnsMenu}>Columns</Button>
            {isColumnsMenuOpen ? <ColumnVisibilityMenu table={table} onClose={onCloseColumnsMenu} /> : null}
          </div>
        ) : null}
        {toolbarActions}
        {resolvedWorkspaceActions}
        {canCreateRows && workspaceMode === 'edit' ? (
          <Button variant="secondary" size="sm" leadingIcon={<PencilLine className="h-4 w-4" />} onClick={onAddRow}>Add row</Button>
        ) : null}
        {hasDraftEditing && workspaceMode !== 'browse' ? (
          <>
            <Button variant="secondary" size="sm" onClick={onDiscardChanges}>Discard changes</Button>
            <Button variant="primary" size="sm" onClick={onApplyChanges}>Apply changes</Button>
          </>
        ) : null}
        {!hasModeTabs && ((showCsvExport && table.getRowModel().rows.length > 0) || inlineCsvConfigPresent || hasDraftCsvColumns) ? (
          <Button variant={isInlineCsvMode ? 'primary' : 'secondary'} size="sm" leadingIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={onToggleCsv}>
            {csvLabel}
          </Button>
        ) : null}
        {!hasModeTabs && showEditToggle && hasEditableColumns ? (
          <Button variant={workspaceMode === 'edit' ? 'primary' : 'secondary'} size="sm" leadingIcon={<PencilLine className="h-4 w-4" />} onClick={onToggleEdit}>
            Edit table
          </Button>
        ) : null}
      </div>
    </div>
  );
}
