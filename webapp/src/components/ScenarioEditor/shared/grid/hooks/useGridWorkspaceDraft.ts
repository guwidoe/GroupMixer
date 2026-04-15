import React from 'react';
import type { ScenarioDataGridColumn, ScenarioDataGridWorkspaceConfig } from '../types';
import { escapeCsvValue, parseCsvText } from '../model/csvCodec';
import { formatColumnRawValue, parseColumnRawValue } from '../model/rawCodec';

function cloneRow<T>(row: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(row);
  }
  return JSON.parse(JSON.stringify(row)) as T;
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => cloneRow(row));
}

interface UseGridWorkspaceDraftArgs<T> {
  browseModeEnabled: boolean;
  rows: T[];
  workspace?: ScenarioDataGridWorkspaceConfig<T>;
  draftEditableColumns: ScenarioDataGridColumn<T>[];
}

export function useGridWorkspaceDraft<T>({ browseModeEnabled, rows, workspace, draftEditableColumns }: UseGridWorkspaceDraftArgs<T>) {
  const [draftRowsState, setDraftRowsState] = React.useState<T[]>(() => cloneRows(rows));
  const [csvDraftText, setCsvDraftText] = React.useState('');
  const [csvErrors, setCsvErrors] = React.useState<string[]>([]);
  const [isDraftDirty, setIsDraftDirty] = React.useState(false);
  const previousWorkspaceModeRef = React.useRef<'browse' | 'edit' | 'csv'>(workspace?.mode ?? (browseModeEnabled ? 'browse' : 'edit'));

  const workspaceMode = workspace?.mode ?? 'browse';
  const normalizedWorkspaceMode = browseModeEnabled ? workspaceMode : (workspaceMode === 'csv' ? 'csv' : 'edit');
  const draftConfig = workspace?.draft;
  const inlineCsvConfig = workspace?.csv;
  const hasDraftEditing = Boolean(draftConfig) && draftEditableColumns.length > 0;
  const isInlineCsvMode = normalizedWorkspaceMode === 'csv' && (hasDraftEditing || Boolean(inlineCsvConfig));
  const effectiveEditMode = workspace ? normalizedWorkspaceMode === 'edit' : false;
  const activeRows = hasDraftEditing && normalizedWorkspaceMode !== 'browse' ? draftRowsState : rows;

  const replaceDraftRows = React.useCallback((nextRows: T[], options?: { dirty?: boolean }) => {
    setDraftRowsState(cloneRows(nextRows));
    setIsDraftDirty(options?.dirty ?? false);
  }, []);

  const setDraftRows = React.useCallback<React.Dispatch<React.SetStateAction<T[]>>>((nextRows) => {
    setIsDraftDirty(true);
    setDraftRowsState(nextRows);
  }, []);

  const buildDraftCsvText = React.useCallback((sourceRows: T[]) => {
    const headerLine = draftEditableColumns.map((column) => escapeCsvValue(column.header)).join(',');
    const rowLines = sourceRows.map((row) =>
      draftEditableColumns
        .map((column) => escapeCsvValue(formatColumnRawValue(row, column)))
        .join(','),
    );

    return [headerLine, ...rowLines].join('\n');
  }, [draftEditableColumns]);

  const parseDraftCsvText = React.useCallback((text: string, sourceRows: T[]) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return { rows: [] as T[], errors: [] as string[] };
    }

    const records = parseCsvText(trimmed);
    if (records.length === 0) {
      return { rows: [] as T[], errors: [] as string[] };
    }

    const [headerRecord, ...dataRecords] = records;
    const expectedHeaders = draftEditableColumns.map((column) => column.header);
    const actualHeaders = headerRecord.map((cell) => cell.trim());
    if (expectedHeaders.length !== actualHeaders.length || expectedHeaders.some((header, index) => header !== actualHeaders[index])) {
      return { rows: sourceRows, errors: [`CSV headers must exactly match: ${expectedHeaders.join(', ')}.`] };
    }

    const nextRows: T[] = [];
    const errors: string[] = [];

    dataRecords.forEach((record, rowIndex) => {
      let nextRow = rowIndex < sourceRows.length
        ? cloneRow(sourceRows[rowIndex] as T)
        : draftConfig?.createRow
          ? cloneRow(draftConfig.createRow())
          : null;

      if (!nextRow) {
        errors.push(`CSV row ${rowIndex + 2} adds a new row, but this grid has no createRow handler.`);
        return;
      }

      draftEditableColumns.forEach((column, columnIndex) => {
        const rawValue = record[columnIndex] ?? '';
        const parsed = parseColumnRawValue(column, rawValue, nextRow as T);
        if (!parsed.ok) {
          errors.push(`Row ${rowIndex + 2}, ${column.header}: ${parsed.error}`);
          return;
        }
        nextRow = 'setValue' in column && column.setValue ? column.setValue(nextRow as T, parsed.value as never) : nextRow;
      });

      if (nextRow) {
        nextRows.push(nextRow as T);
      }
    });

    return { rows: errors.length > 0 ? sourceRows : nextRows, errors };
  }, [draftConfig, draftEditableColumns]);

  const requestWorkspaceMode = React.useCallback((nextMode: 'browse' | 'edit' | 'csv') => {
    if (!workspace?.onModeChange) {
      return;
    }

    if (!browseModeEnabled && nextMode === 'browse') {
      replaceDraftRows(rows);
      setCsvDraftText('');
      setCsvErrors([]);
      workspace.onModeChange('edit');
      return;
    }

    if (!hasDraftEditing) {
      workspace.onModeChange(!browseModeEnabled && nextMode === 'browse' ? 'edit' : nextMode);
      return;
    }

    if (nextMode === 'browse') {
      replaceDraftRows(rows);
      setCsvDraftText('');
      setCsvErrors([]);
      workspace.onModeChange('browse');
      return;
    }

    if (normalizedWorkspaceMode === 'csv') {
      const parsed = parseDraftCsvText(csvDraftText, draftRowsState);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        return;
      }
      setDraftRowsState(parsed.rows);
      setIsDraftDirty(true);
      setCsvErrors([]);
      if (nextMode === 'edit') {
        workspace.onModeChange('edit');
        return;
      }
      setCsvDraftText(buildDraftCsvText(parsed.rows));
      workspace.onModeChange('csv');
      return;
    }

    if (nextMode === 'edit') {
      replaceDraftRows(rows);
      setCsvErrors([]);
      workspace.onModeChange('edit');
      return;
    }

    const nextDraftRows = normalizedWorkspaceMode === 'edit' ? cloneRows(draftRowsState) : cloneRows(rows);
    setDraftRowsState(nextDraftRows);
    setCsvDraftText(buildDraftCsvText(nextDraftRows));
    setCsvErrors([]);
    workspace.onModeChange('csv');
  }, [browseModeEnabled, buildDraftCsvText, csvDraftText, draftRowsState, hasDraftEditing, normalizedWorkspaceMode, parseDraftCsvText, replaceDraftRows, rows, workspace]);

  const handleApplyDraftChanges = React.useCallback(() => {
    if (!draftConfig) {
      return;
    }

    if (normalizedWorkspaceMode === 'csv') {
      const parsed = parseDraftCsvText(csvDraftText, draftRowsState);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        return;
      }
      draftConfig.onApply(parsed.rows);
      setDraftRowsState(cloneRows(parsed.rows));
      setIsDraftDirty(false);
      setCsvErrors([]);
      workspace?.onModeChange(browseModeEnabled ? 'browse' : 'edit');
      return;
    }

    draftConfig.onApply(draftRowsState);
    setIsDraftDirty(false);
    setCsvErrors([]);
    workspace?.onModeChange(browseModeEnabled ? 'browse' : 'edit');
  }, [browseModeEnabled, csvDraftText, draftConfig, draftRowsState, normalizedWorkspaceMode, parseDraftCsvText, workspace]);

  const handleAddDraftRow = React.useCallback(() => {
    if (!draftConfig?.createRow) {
      return;
    }
    setDraftRows((current) => [...current, cloneRow(draftConfig.createRow!())]);
  }, [draftConfig, setDraftRows]);

  React.useEffect(() => {
    if (!hasDraftEditing || isDraftDirty) {
      return;
    }

    setDraftRowsState(cloneRows(rows));

    if (normalizedWorkspaceMode === 'csv') {
      setCsvDraftText(buildDraftCsvText(rows));
    }
  }, [buildDraftCsvText, hasDraftEditing, isDraftDirty, normalizedWorkspaceMode, rows]);

  React.useEffect(() => {
    const previousWorkspaceMode = previousWorkspaceModeRef.current;
    previousWorkspaceModeRef.current = normalizedWorkspaceMode;

    if (!hasDraftEditing) {
      return;
    }

    if (normalizedWorkspaceMode !== 'browse' || previousWorkspaceMode === 'browse') {
      return;
    }

    replaceDraftRows(rows);
    setCsvDraftText('');
    setCsvErrors([]);
  }, [hasDraftEditing, normalizedWorkspaceMode, replaceDraftRows, rows]);

  return {
    activeRows,
    csvDraftText,
    csvErrors,
    draftConfig,
    draftRows: draftRowsState,
    effectiveEditMode,
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
  };
}
