import React from 'react';
import { Columns3, FileSpreadsheet, PencilLine, Search, X } from 'lucide-react';
import type { Table } from '@tanstack/react-table';
import { Button } from '../../../../ui';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';

interface GridToolbarProps<T> {
  csvLabel: string;
  doneEditingLabel: string;
  editLabel: string;
  globalFilter: string;
  hasDraftCsvColumns: boolean;
  hasDraftEditing: boolean;
  hasEditableColumns: boolean;
  inlineCsvConfigPresent: boolean;
  isColumnsMenuOpen: boolean;
  isInlineCsvMode: boolean;
  setGlobalFilter: (value: string) => void;
  onToggleColumnsMenu: () => void;
  onCloseColumnsMenu: () => void;
  onToggleCsv: () => void;
  onToggleEdit: () => void;
  onDiscardChanges: () => void;
  onApplyChanges: () => void;
  onAddRow: () => void;
  resolvedWorkspaceActions: React.ReactNode;
  searchPlaceholder: string;
  showCsvExport: boolean;
  showEditToggle: boolean;
  showToolbarSearch: boolean;
  summary: React.ReactNode;
  table: Table<T>;
  toolbarActions?: React.ReactNode;
  workspaceMode: 'browse' | 'edit' | 'csv';
}

export function GridToolbar<T>({
  csvLabel,
  doneEditingLabel,
  editLabel,
  globalFilter,
  hasDraftCsvColumns,
  hasDraftEditing,
  hasEditableColumns,
  inlineCsvConfigPresent,
  isColumnsMenuOpen,
  isInlineCsvMode,
  setGlobalFilter,
  onToggleColumnsMenu,
  onCloseColumnsMenu,
  onToggleCsv,
  onToggleEdit,
  onDiscardChanges,
  onApplyChanges,
  onAddRow,
  resolvedWorkspaceActions,
  searchPlaceholder,
  showCsvExport,
  showEditToggle,
  showToolbarSearch,
  summary,
  table,
  toolbarActions,
  workspaceMode,
}: GridToolbarProps<T>) {
  return (
    <div className={`flex border-b px-4 ${showToolbarSearch ? 'py-3' : 'py-2.5'} flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`} style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className={`flex min-w-0 flex-1 ${showToolbarSearch ? 'flex-col gap-3 lg:flex-row lg:items-center lg:gap-4' : 'items-center'}`}>
        {showToolbarSearch ? (
          <label className="relative block min-w-0 flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder={searchPlaceholder}
              className="input h-10 w-full rounded-xl pl-9 pr-10"
              aria-label="Search table"
            />
            {globalFilter ? (
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5" style={{ color: 'var(--text-tertiary)' }} onClick={() => setGlobalFilter('')} aria-label="Clear table search">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
        ) : null}
        <div className="min-w-0">{summary}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {toolbarActions}
        {hasDraftEditing && workspaceMode === 'edit' ? (
          <Button variant="secondary" size="sm" leadingIcon={<PencilLine className="h-4 w-4" />} onClick={onAddRow}>Add row</Button>
        ) : null}
        {hasDraftEditing && workspaceMode !== 'browse' ? (
          <>
            <Button variant="secondary" size="sm" onClick={onDiscardChanges}>Discard changes</Button>
            <Button variant="primary" size="sm" onClick={onApplyChanges}>Apply changes</Button>
          </>
        ) : null}
        {resolvedWorkspaceActions}
        {((showCsvExport && table.getRowModel().rows.length > 0) || inlineCsvConfigPresent || hasDraftCsvColumns) ? (
          <Button variant={isInlineCsvMode ? 'primary' : 'secondary'} size="sm" leadingIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={onToggleCsv}>
            {csvLabel}
          </Button>
        ) : null}
        {showEditToggle && hasEditableColumns ? (
          <Button variant={workspaceMode === 'edit' ? 'primary' : 'secondary'} size="sm" leadingIcon={<PencilLine className="h-4 w-4" />} onClick={onToggleEdit}>
            {workspaceMode === 'edit' ? doneEditingLabel : editLabel}
          </Button>
        ) : null}
        {!isInlineCsvMode ? (
          <div className="relative">
            <Button variant="secondary" size="sm" leadingIcon={<Columns3 className="h-4 w-4" />} onClick={onToggleColumnsMenu}>Columns</Button>
            {isColumnsMenuOpen ? <ColumnVisibilityMenu table={table} onClose={onCloseColumnsMenu} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
