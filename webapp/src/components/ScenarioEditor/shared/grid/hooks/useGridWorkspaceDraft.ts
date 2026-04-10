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
  rows: T[];
  workspace?: ScenarioDataGridWorkspaceConfig<T>;
  draftEditableColumns: ScenarioDataGridColumn<T>[];
}

export function useGridWorkspaceDraft<T>({ rows, workspace, draftEditableColumns }: UseGridWorkspaceDraftArgs<T>) {
  const [draftRows, setDraftRows] = React.useState<T[]>(() => cloneRows(rows));
  const [csvDraftText, setCsvDraftText] = React.useState('');
  const [csvErrors, setCsvErrors] = React.useState<string[]>([]);

  const workspaceMode = workspace?.mode ?? 'browse';
  const draftConfig = workspace?.draft;
  const inlineCsvConfig = workspace?.csv;
  const hasDraftEditing = Boolean(draftConfig) && draftEditableColumns.length > 0;
  const isInlineCsvMode = workspaceMode === 'csv' && (hasDraftEditing || Boolean(inlineCsvConfig));
  const effectiveEditMode = workspace ? workspaceMode === 'edit' : false;
  const activeRows = hasDraftEditing && workspaceMode !== 'browse' ? draftRows : rows;

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

    if (!hasDraftEditing) {
      workspace.onModeChange(nextMode);
      return;
    }

    if (nextMode === 'browse') {
      setDraftRows(cloneRows(rows));
      setCsvDraftText('');
      setCsvErrors([]);
      workspace.onModeChange('browse');
      return;
    }

    if (workspaceMode === 'csv') {
      const parsed = parseDraftCsvText(csvDraftText, draftRows);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        return;
      }
      setDraftRows(parsed.rows);
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
      setDraftRows(cloneRows(rows));
      setCsvErrors([]);
      workspace.onModeChange('edit');
      return;
    }

    const nextDraftRows = workspaceMode === 'edit' ? cloneRows(draftRows) : cloneRows(rows);
    setDraftRows(nextDraftRows);
    setCsvDraftText(buildDraftCsvText(nextDraftRows));
    setCsvErrors([]);
    workspace.onModeChange('csv');
  }, [buildDraftCsvText, csvDraftText, draftRows, hasDraftEditing, parseDraftCsvText, rows, workspace, workspaceMode]);

  const handleApplyDraftChanges = React.useCallback(() => {
    if (!draftConfig) {
      return;
    }

    if (workspaceMode === 'csv') {
      const parsed = parseDraftCsvText(csvDraftText, draftRows);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        return;
      }
      draftConfig.onApply(parsed.rows);
      setDraftRows(cloneRows(parsed.rows));
      setCsvErrors([]);
      workspace?.onModeChange('browse');
      return;
    }

    draftConfig.onApply(draftRows);
    setCsvErrors([]);
    workspace?.onModeChange('browse');
  }, [csvDraftText, draftConfig, draftRows, parseDraftCsvText, workspace, workspaceMode]);

  const handleAddDraftRow = React.useCallback(() => {
    if (!draftConfig?.createRow) {
      return;
    }
    setDraftRows((current) => [...current, cloneRow(draftConfig.createRow!())]);
  }, [draftConfig]);

  React.useEffect(() => {
    if (!hasDraftEditing || workspaceMode !== 'browse') {
      return;
    }
    setDraftRows(cloneRows(rows));
    setCsvDraftText('');
    setCsvErrors([]);
  }, [hasDraftEditing, rows, workspaceMode]);

  return {
    activeRows,
    csvDraftText,
    csvErrors,
    draftConfig,
    draftRows,
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
