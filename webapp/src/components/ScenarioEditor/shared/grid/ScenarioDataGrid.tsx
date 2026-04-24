import React from 'react';
import { type SortingState } from '@tanstack/react-table';
import { CsvPreviewDialog } from './components/CsvPreviewDialog';
import { GridActiveFiltersBar } from './components/GridActiveFiltersBar';
import { GridPaginationFooter } from './components/GridPaginationFooter';
import { GridPreparingLoader } from './components/GridPreparingLoader';
import { SetupGridLeaveConfirmModal } from './components/SetupGridLeaveConfirmModal';
import { GridTable } from './components/GridTable';
import { GridToolbar } from './components/GridToolbar';
import { GridTopScrollbar } from './components/GridTopScrollbar';
import { GridVerticalResizeHandle } from './components/GridVerticalResizeHandle';
import { InlineCsvEditor } from './components/InlineCsvEditor';
import { isCustomColumn, isPrimitiveColumn, materializeColumns } from './model/columnMaterialization';
import { escapeCsvValue } from './model/csvCodec';
import { resolveExportValue } from './model/exportUtils';
import { useGridColumnResize } from './hooks/useGridColumnResize';
import { useGridColumnState } from './hooks/useGridColumnState';
import { useGridViewportResize } from './hooks/useGridViewportResize';
import { useGridScrollSync } from './hooks/useGridScrollSync';
import { useScenarioDataTable } from './hooks/useScenarioDataTable';
import { useGridWorkspaceDraft } from './hooks/useGridWorkspaceDraft';
import type { ScenarioDataGridColumn, ScenarioDataGridWorkspaceConfig } from './types';
import { useAppStore } from '../../../../store';

type PendingLeaveAction = { continueAction: () => void };

interface ScenarioDataGridProps<T> {
  rows: T[];
  columns: Array<ScenarioDataGridColumn<T>>;
  rowKey: (row: T, index: number) => string;
  filterQuery?: string;
  emptyState?: React.ReactNode;
  onRowOpen?: (row: T) => void;
  rowOpenLabel?: (row: T, index: number) => string;
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
  onRowOpen,
  rowOpenLabel,
  showCsvExport = true,
  showEditToggle = true,
  defaultEditMode = false,
  workspace,
  searchSummary,
  toolbarActions,
  maxHeight = 'min(64vh, calc(100vh - 20rem))',
  pageSize = 100,
  pageSizeOptions = [50, 100, 250, 500],
}: ScenarioDataGridProps<T>) {
  const browseModeEnabled = workspace?.browseModeEnabled ?? true;
  const requestedWorkspaceMode = workspace?.mode ?? 'browse';
  const normalizedRequestedWorkspaceMode = browseModeEnabled
    ? requestedWorkspaceMode
    : (requestedWorkspaceMode === 'csv' ? 'csv' : 'edit');
  const shouldDeferColdGridMount = Boolean(workspace?.draft)
    && normalizedRequestedWorkspaceMode === 'edit'
    && rows.length >= 50;
  const [hasMountedGridSurface, setHasMountedGridSurface] = React.useState(() => !shouldDeferColdGridMount);
  const isColdGridDeferred = shouldDeferColdGridMount && !hasMountedGridSurface;
  const tableRows = isColdGridDeferred ? [] : rows;
  const activeWorkspace = isColdGridDeferred ? undefined : workspace;
  const materializedColumns = React.useMemo(
    () => isColdGridDeferred ? [] : materializeColumns(columns, rows),
    [columns, isColdGridDeferred, rows],
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [openFilterId, setOpenFilterId] = React.useState<string | null>(null);
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(defaultEditMode);
  const [isCsvPreviewOpen, setIsCsvPreviewOpen] = React.useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = React.useState<PendingLeaveAction | null>(null);
  const setSetupGridUnsaved = useAppStore((state) => state.setSetupGridUnsaved);
  const setSetupGridLeaveHook = useAppStore((state) => state.setSetupGridLeaveHook);

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
    discardDraftChanges,
    draftConfig,
    hasDraftEditing,
    hasUnappliedChanges,
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
    browseModeEnabled,
    rows: tableRows,
    workspace: activeWorkspace,
    draftEditableColumns,
  });
  const normalizedWorkspaceMode = browseModeEnabled ? workspaceMode : (workspaceMode === 'csv' ? 'csv' : 'edit');
  const effectiveEditMode = workspace ? normalizedWorkspaceMode === 'edit' : isEditMode;

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
  const {
    handleResizeKeyDown,
    isResizing,
    resetViewportHeight,
    startViewportResize,
    viewportHeight,
  } = useGridViewportResize({ bodyScrollRef });

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
  const handleDeleteDraftRow = React.useCallback((targetRow: T) => {
    setDraftRows((current) => current.filter((candidate) => candidate !== targetRow));
  }, [setDraftRows]);
  const { activeColumnFilters, csvColumns, exportRows, filteredCount, table, totalCount } = useScenarioDataTable({
    activeRows,
    columnFilters,
    columnSizing,
    columnVisibility,
    deleteDraftRowLabel: draftConfig?.deleteRowLabel,
    effectiveEditMode,
    globalFilter: mergedQuery,
    materializedColumns,
    onDeleteDraftRow: draftConfig?.canDeleteRows ? handleDeleteDraftRow : undefined,
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
      if (normalizedWorkspaceMode === 'csv') {
        return;
      }

      requestWorkspaceMode('csv');
      return;
    }

    setIsCsvPreviewOpen(true);
  }, [hasDraftEditing, inlineCsvConfig, normalizedWorkspaceMode, requestWorkspaceMode, workspace]);
  const handleToggleEdit = React.useCallback(() => {
    if (workspace?.onModeChange) {
      if (normalizedWorkspaceMode === 'edit') {
        return;
      }

      requestWorkspaceMode(effectiveEditMode ? 'browse' : 'edit');
      return;
    }

    setIsEditMode((current) => !current);
  }, [effectiveEditMode, normalizedWorkspaceMode, requestWorkspaceMode, workspace]);

  const clearPendingLeaveAction = React.useCallback(() => {
    setPendingLeaveAction(null);
  }, []);

  const continuePendingLeaveAction = React.useCallback((action: PendingLeaveAction) => {
    action.continueAction();
  }, []);

  const openLeaveConfirmation = React.useCallback((action: PendingLeaveAction) => {
    setPendingLeaveAction(action);
  }, []);

  const handleDiscardAndLeave = React.useCallback(() => {
    const action = pendingLeaveAction;
    discardDraftChanges();
    setPendingLeaveAction(null);
    if (action) {
      continuePendingLeaveAction(action);
    }
  }, [continuePendingLeaveAction, discardDraftChanges, pendingLeaveAction]);

  const handleApplyAndLeave = React.useCallback(() => {
    const action = pendingLeaveAction;
    const didApply = handleApplyDraftChanges();
    setPendingLeaveAction(null);
    if (didApply && action) {
      continuePendingLeaveAction(action);
    }
  }, [continuePendingLeaveAction, handleApplyDraftChanges, pendingLeaveAction]);

  React.useEffect(() => {
    if (hasMountedGridSurface) {
      return;
    }

    if (!shouldDeferColdGridMount) {
      setHasMountedGridSurface(true);
      return;
    }

    if (isInlineCsvMode || typeof window === 'undefined') {
      return;
    }

    const timer = window.setTimeout(() => {
      setHasMountedGridSurface(true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasMountedGridSurface, isInlineCsvMode, shouldDeferColdGridMount]);

  React.useLayoutEffect(() => {
    if (!hasDraftEditing) {
      setSetupGridUnsaved(false);
      setSetupGridLeaveHook(null);
      return;
    }

    setSetupGridUnsaved(hasUnappliedChanges);
    setSetupGridLeaveHook((continueAction) => {
      openLeaveConfirmation({ continueAction });
    });

    return () => {
      setSetupGridUnsaved(false);
      setSetupGridLeaveHook(null);
    };
  }, [hasDraftEditing, hasUnappliedChanges, openLeaveConfirmation, setSetupGridLeaveHook, setSetupGridUnsaved]);

  React.useEffect(() => {
    if (!hasDraftEditing || !hasUnappliedChanges || typeof window === 'undefined') {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasDraftEditing, hasUnappliedChanges]);

  return (
    <div
      className="overflow-hidden rounded-[1.25rem] border shadow-sm"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <SetupGridLeaveConfirmModal
        open={pendingLeaveAction !== null}
        onStay={clearPendingLeaveAction}
        onDiscardAndLeave={handleDiscardAndLeave}
        onApplyAndLeave={handleApplyAndLeave}
      />

      <GridToolbar
        browseModeEnabled={browseModeEnabled}
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
        onDiscardChanges={() => discardDraftChanges()}
        onApplyChanges={handleApplyDraftChanges}
        onAddRow={handleAddDraftRow}
        resolvedWorkspaceActions={resolvedWorkspaceActions}
        showCsvExport={showCsvExport && csvColumns.length > 0}
        showEditToggle={showEditToggle}
        table={table}
        toolbarActions={toolbarActions}
        workspaceMode={workspace ? normalizedWorkspaceMode : (effectiveEditMode ? 'edit' : 'browse')}
      />

      {!hasMountedGridSurface && !isInlineCsvMode ? <GridPreparingLoader /> : null}

      {hasMountedGridSurface ? (
        <div className="relative">
          <div
            data-testid="scenario-grid-table-surface"
            aria-hidden={isInlineCsvMode}
            style={isInlineCsvMode
              ? { pointerEvents: 'none', visibility: 'hidden' }
              : undefined}
          >
            <GridActiveFiltersBar activeColumnFilters={activeColumnFilters} summary={filteredSummary} onClearFilters={() => table.resetColumnFilters()} />

            <GridTopScrollbar scrollWidth={scrollMetrics.scrollWidth} clientWidth={scrollMetrics.clientWidth} topScrollRef={topScrollRef} onScroll={() => syncScroll('top')} />

            <GridTable
              activeRows={activeRows}
              bodyScrollRef={bodyScrollRef}
              emptyState={emptyState}
              maxHeight={maxHeight}
              viewportHeight={viewportHeight}
              onBodyScroll={() => syncScroll('body')}
              onCloseFilter={(columnId) => setOpenFilterId((current) => current === columnId ? null : current)}
              onRowOpen={!effectiveEditMode && !isInlineCsvMode ? onRowOpen : undefined}
              onStartResize={startColumnResize}
              onToggleFilter={(columnId) => setOpenFilterId((current) => current === columnId ? null : columnId)}
              openFilterId={openFilterId}
              rowOpenLabel={rowOpenLabel}
              table={table}
              tableRef={tableRef}
              virtualizeRows={effectiveEditMode}
            />

            <GridVerticalResizeHandle
              isResizing={isResizing}
              onPointerStart={startViewportResize}
              onReset={resetViewportHeight}
              onKeyDown={handleResizeKeyDown}
            />

            <GridPaginationFooter filteredCount={filteredCount} pageSizeOptions={pageSizeOptions} table={table} />
          </div>

          {isInlineCsvMode ? (
            <div className="absolute inset-0 z-10" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <InlineCsvEditor
                dataTestId="scenario-grid-csv-surface"
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
            </div>
          ) : null}
        </div>
      ) : null}

      {isCsvPreviewOpen ? (
        <CsvPreviewDialog csvText={csvText} rowCount={exportRows.length} onClose={() => setIsCsvPreviewOpen(false)} />
      ) : null}

    </div>
  );
}
