import React from 'react';
import { type SortingState } from '@tanstack/react-table';
import { CsvPreviewDialog } from './components/CsvPreviewDialog';
import { GridActiveFiltersBar } from './components/GridActiveFiltersBar';
import { GridPaginationFooter } from './components/GridPaginationFooter';
import { GridTable } from './components/GridTable';
import { GridToolbar } from './components/GridToolbar';
import { GridTopScrollbar } from './components/GridTopScrollbar';
import { InlineCsvEditor } from './components/InlineCsvEditor';
import { isCustomColumn, isPrimitiveColumn, materializeColumns } from './model/columnMaterialization';
import { escapeCsvValue } from './model/csvCodec';
import { resolveExportValue } from './model/exportUtils';
import { useGridColumnResize } from './hooks/useGridColumnResize';
import { useGridColumnState } from './hooks/useGridColumnState';
import { useGridScrollSync } from './hooks/useGridScrollSync';
import { useScenarioDataTable } from './hooks/useScenarioDataTable';
import { useGridWorkspaceDraft } from './hooks/useGridWorkspaceDraft';
import type { ScenarioDataGridColumn, ScenarioDataGridWorkspaceConfig } from './types';

interface ScenarioDataGridProps<T> {
  rows: T[];
  columns: Array<ScenarioDataGridColumn<T>>;
  rowKey: (row: T, index: number) => string;
  filterQuery?: string;
  emptyState?: React.ReactNode;
  searchPlaceholder?: string;
  showCsvExport?: boolean;
  showEditToggle?: boolean;
  defaultEditMode?: boolean;
  workspace?: ScenarioDataGridWorkspaceConfig<T>;
  searchSummary?: (args: { filteredCount: number; totalCount: number; query: string }) => React.ReactNode;
  toolbarActions?: React.ReactNode;
  maxHeight?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
}

export function ScenarioDataGrid<T>({
  rows,
  columns,
  rowKey,
  filterQuery = '',
  emptyState,
  showCsvExport = true,
  showEditToggle = true,
  defaultEditMode = false,
  workspace,
  searchSummary,
  toolbarActions,
  maxHeight = 'min(70vh, calc(100vh - 18rem))',
  pageSize = 100,
  pageSizeOptions = [50, 100, 250, 500],
}: ScenarioDataGridProps<T>) {
  const materializedColumns = React.useMemo(
    () => materializeColumns(columns, rows),
    [columns, rows],
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [openFilterId, setOpenFilterId] = React.useState<string | null>(null);
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(defaultEditMode);
  const [isCsvPreviewOpen, setIsCsvPreviewOpen] = React.useState(false);

  const draftEditableColumns = React.useMemo(
    () => materializedColumns.filter((column) => (
      (isPrimitiveColumn(column) && Boolean(column.setValue))
      || (isCustomColumn(column) && Boolean(column.setValue) && Boolean(column.rawCodec))
    )),
    [materializedColumns],
  );
  const {
    activeRows,
    csvDraftText,
    csvErrors,
    draftConfig,
    hasDraftEditing,
    inlineCsvConfig,
    isInlineCsvMode,
    requestWorkspaceMode,
    setCsvDraftText,
    setCsvErrors,
    setDraftRows,
    workspaceMode,
    handleAddDraftRow,
    handleApplyDraftChanges,
  } = useGridWorkspaceDraft({
    rows,
    workspace,
    draftEditableColumns,
  });
  const effectiveEditMode = workspace ? workspaceMode === 'edit' : isEditMode;

  const {
    columnFilters,
    columnSizing,
    columnVisibility,
    setColumnFilters,
    setColumnSizing,
    setColumnVisibility,
  } = useGridColumnState({ columns: materializedColumns });

  const mergedQuery = React.useMemo(() => filterQuery.trim(), [filterQuery]);

  const { bodyScrollRef, scrollMetrics, syncScroll, tableRef, topScrollRef } = useGridScrollSync({
    deps: [activeRows, columnSizing, columnVisibility, sorting, mergedQuery],
  });

  const { startColumnResize } = useGridColumnResize({ columns: materializedColumns, setColumnSizing });

  const hasEditableColumns = React.useMemo(
    () => materializedColumns.some((column) => (
      (isPrimitiveColumn(column) && Boolean(column.setValue))
      || ('editor' in column && Boolean(column.editor))
      || (isCustomColumn(column) && Boolean(column.setValue) && Boolean(column.renderEditor))
    )),
    [materializedColumns],
  );
  const resolvedWorkspaceActions = React.useMemo(() => {
    if (!workspace?.toolbarActions) {
      return null;
    }

    return typeof workspace.toolbarActions === 'function'
      ? workspace.toolbarActions(workspaceMode)
      : workspace.toolbarActions;
  }, [workspace, workspaceMode]);
  const { activeColumnFilters, csvColumns, exportRows, filteredCount, table, totalCount } = useScenarioDataTable({
    activeRows,
    columnFilters,
    columnSizing,
    columnVisibility,
    effectiveEditMode,
    globalFilter: mergedQuery,
    materializedColumns,
    pageSize,
    rowKey,
    setColumnFilters,
    setColumnSizing,
    setColumnVisibility,
    setDraftRows,
    sorting,
    setSorting,
  });
  const hasDraftCsvColumns = draftEditableColumns.length > 0;
  const canCreateRows = Boolean(draftConfig?.createRow);
  const hasModeTabs = Boolean(workspace?.onModeChange)
    && ((showEditToggle && hasEditableColumns) || hasDraftCsvColumns || Boolean(inlineCsvConfig));
  const csvText = React.useMemo(() => {
    const headerLine = csvColumns.map((column) => escapeCsvValue(column.header)).join(',');
    const rowLines = exportRows.map((row) =>
      csvColumns
        .map((column) => escapeCsvValue(resolveExportValue(row.original, column.sourceColumn)))
        .join(','),
    );
    return [headerLine, ...rowLines].join('\n');
  }, [csvColumns, exportRows]);
  const filteredSummary = filteredCount < totalCount
    ? (searchSummary
    ? searchSummary({ filteredCount, totalCount, query: filterQuery })
    : (
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Showing {filteredCount}/{totalCount} rows.
      </div>
    ))
    : null;
  const handleToggleCsv = React.useCallback(() => {
    if (workspace?.onModeChange && (hasDraftEditing || inlineCsvConfig)) {
      requestWorkspaceMode(isInlineCsvMode ? 'browse' : 'csv');
      return;
    }

    setIsCsvPreviewOpen(true);
  }, [hasDraftEditing, inlineCsvConfig, isInlineCsvMode, requestWorkspaceMode, workspace]);
  const handleToggleEdit = React.useCallback(() => {
    if (workspace?.onModeChange) {
      requestWorkspaceMode(effectiveEditMode ? 'browse' : 'edit');
      return;
    }

    setIsEditMode((current) => !current);
  }, [effectiveEditMode, requestWorkspaceMode, workspace]);

  return (
    <div
      className="overflow-hidden rounded-[1.25rem] border shadow-sm"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <GridToolbar
        canCreateRows={canCreateRows}
        csvLabel={workspace?.csvLabel ?? 'CSV'}
        hasDraftCsvColumns={hasDraftCsvColumns}
        hasDraftEditing={hasDraftEditing}
        hasEditableColumns={hasEditableColumns}
        hasModeTabs={hasModeTabs}
        inlineCsvConfigPresent={Boolean(inlineCsvConfig)}
        isColumnsMenuOpen={isColumnsMenuOpen}
        isInlineCsvMode={isInlineCsvMode}
        onToggleColumnsMenu={() => setIsColumnsMenuOpen((open) => !open)}
        onCloseColumnsMenu={() => setIsColumnsMenuOpen(false)}
        onToggleCsv={handleToggleCsv}
        onToggleEdit={handleToggleEdit}
        onSelectBrowse={() => requestWorkspaceMode('browse')}
        onDiscardChanges={() => requestWorkspaceMode('browse')}
        onApplyChanges={handleApplyDraftChanges}
        onAddRow={handleAddDraftRow}
        resolvedWorkspaceActions={resolvedWorkspaceActions}
        showCsvExport={showCsvExport && csvColumns.length > 0}
        showEditToggle={showEditToggle}
        table={table}
        toolbarActions={toolbarActions}
        workspaceMode={effectiveEditMode ? 'edit' : workspaceMode}
      />

      {!isInlineCsvMode ? <GridActiveFiltersBar activeColumnFilters={activeColumnFilters} summary={filteredSummary} onClearFilters={() => table.resetColumnFilters()} /> : null}

      {!isInlineCsvMode ? <GridTopScrollbar scrollWidth={scrollMetrics.scrollWidth} clientWidth={scrollMetrics.clientWidth} topScrollRef={topScrollRef} onScroll={() => syncScroll('top')} /> : null}

      {isCsvPreviewOpen ? (
        <CsvPreviewDialog csvText={csvText} rowCount={exportRows.length} onClose={() => setIsCsvPreviewOpen(false)} />
      ) : null}

      {isInlineCsvMode ? (
        <InlineCsvEditor
          ariaLabel={hasDraftEditing ? (draftConfig?.csv?.ariaLabel ?? 'Inline CSV editor') : (inlineCsvConfig?.ariaLabel ?? 'Inline CSV editor')}
          csvErrors={hasDraftEditing ? csvErrors : []}
          helperText={hasDraftEditing ? draftConfig?.csv?.helperText : inlineCsvConfig?.helperText}
          onChange={(value) => {
            if (hasDraftEditing) {
              setCsvDraftText(value);
              if (csvErrors.length > 0) {
                setCsvErrors([]);
              }
              return;
            }
            inlineCsvConfig?.onChange(value);
          }}
          placeholder={hasDraftEditing ? draftConfig?.csv?.placeholder : inlineCsvConfig?.placeholder}
          value={hasDraftEditing ? csvDraftText : (inlineCsvConfig?.value ?? '')}
        />
      ) : (
        <GridTable
          activeRows={activeRows}
          bodyScrollRef={bodyScrollRef}
          emptyState={emptyState}
          maxHeight={maxHeight}
          onBodyScroll={() => syncScroll('body')}
          onCloseFilter={(columnId) => setOpenFilterId((current) => current === columnId ? null : current)}
          onStartResize={startColumnResize}
          onToggleFilter={(columnId) => setOpenFilterId((current) => current === columnId ? null : columnId)}
          openFilterId={openFilterId}
          table={table}
          tableRef={tableRef}
        />
      )}

      {!isInlineCsvMode ? <GridPaginationFooter filteredCount={filteredCount} pageSizeOptions={pageSizeOptions} table={table} /> : null}
    </div>
  );
}
