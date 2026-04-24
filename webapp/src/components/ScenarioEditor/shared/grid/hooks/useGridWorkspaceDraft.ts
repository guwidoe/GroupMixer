import React from 'react';
import type {
  ScenarioDataGridColumn,
  ScenarioDataGridWorkspaceConfig,
  ScenarioDataGridWorkspaceMode,
} from '../types';
import { escapeCsvValue, parseCsvText } from '../model/csvCodec';
import { formatColumnRawValue, parseColumnRawValue } from '../model/rawCodec';

const CSV_PARSE_DEBOUNCE_MS = 180;

type CachedCsvParse<T> = {
  text: string;
  sourceRows: T[];
  result: {
    rows: T[];
    errors: string[];
  };
};

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
  const [csvDraftTextState, setCsvDraftTextState] = React.useState('');
  const [csvErrors, setCsvErrors] = React.useState<string[]>([]);
  const [isDraftDirty, setIsDraftDirty] = React.useState(false);
  const [csvValidationState, setCsvValidationState] = React.useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const previousWorkspaceModeRef = React.useRef<'browse' | 'edit' | 'csv'>(workspace?.mode ?? (browseModeEnabled ? 'browse' : 'edit'));
  const cachedCsvParseRef = React.useRef<CachedCsvParse<T> | null>(null);

  const workspaceMode = workspace?.mode ?? 'browse';
  const normalizedWorkspaceMode = browseModeEnabled ? workspaceMode : (workspaceMode === 'csv' ? 'csv' : 'edit');
  const draftConfig = workspace?.draft;
  const inlineCsvConfig = workspace?.csv;
  const hasDraftEditing = Boolean(draftConfig) && draftEditableColumns.length > 0;
  const isInlineCsvMode = normalizedWorkspaceMode === 'csv' && (hasDraftEditing || Boolean(inlineCsvConfig));
  const effectiveEditMode = workspace ? normalizedWorkspaceMode === 'edit' : false;
  const activeRows = hasDraftEditing && normalizedWorkspaceMode !== 'browse' ? draftRowsState : rows;
  const hasUnappliedChanges = hasDraftEditing && isDraftDirty;

  const replaceDraftRows = React.useCallback((nextRows: T[], options?: { dirty?: boolean }) => {
    setDraftRowsState(cloneRows(nextRows));
    setIsDraftDirty(options?.dirty ?? false);
  }, []);

  const setDraftRows = React.useCallback<React.Dispatch<React.SetStateAction<T[]>>>((nextRows) => {
    setIsDraftDirty(true);
    setDraftRowsState(nextRows);
  }, []);

  const setCsvDraftText = React.useCallback((nextText: string) => {
    setIsDraftDirty(true);
    setCsvDraftTextState(nextText);
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
          ? cloneRow(draftConfig.createRow(sourceRows))
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

  const getCachedDraftCsvParse = React.useCallback((text: string, sourceRows: T[]) => {
    const cached = cachedCsvParseRef.current;
    if (cached && cached.text === text && cached.sourceRows === sourceRows) {
      return cached.result;
    }

    const result = parseDraftCsvText(text, sourceRows);
    cachedCsvParseRef.current = {
      text,
      sourceRows,
      result,
    };
    return result;
  }, [parseDraftCsvText]);

  const discardDraftChanges = React.useCallback((nextMode?: ScenarioDataGridWorkspaceMode) => {
    const resolvedNextMode = nextMode ?? (browseModeEnabled ? 'browse' : 'edit');

    replaceDraftRows(rows);
    setCsvDraftTextState('');
    setCsvErrors([]);
    setCsvValidationState('idle');
    cachedCsvParseRef.current = null;
    workspace?.onModeChange?.(!browseModeEnabled && resolvedNextMode === 'browse' ? 'edit' : resolvedNextMode);
  }, [browseModeEnabled, replaceDraftRows, rows, workspace]);

  const applyDraftChanges = React.useCallback((nextMode?: ScenarioDataGridWorkspaceMode) => {
    if (!draftConfig) {
      return true;
    }

    const resolvedNextMode = nextMode ?? (browseModeEnabled ? 'browse' : 'edit');

    if (normalizedWorkspaceMode === 'csv') {
      const parsed = getCachedDraftCsvParse(csvDraftTextState, draftRowsState);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        setCsvValidationState('invalid');
        return false;
      }

      draftConfig.onApply(parsed.rows);
      setDraftRowsState(cloneRows(parsed.rows));
      setIsDraftDirty(false);
      setCsvErrors([]);
      setCsvValidationState('valid');
      workspace?.onModeChange?.(!browseModeEnabled && resolvedNextMode === 'browse' ? 'edit' : resolvedNextMode);
      return true;
    }

    draftConfig.onApply(draftRowsState);
    setIsDraftDirty(false);
    setCsvErrors([]);
    setCsvValidationState('idle');
    workspace?.onModeChange?.(!browseModeEnabled && resolvedNextMode === 'browse' ? 'edit' : resolvedNextMode);
    return true;
  }, [browseModeEnabled, csvDraftTextState, draftConfig, draftRowsState, getCachedDraftCsvParse, normalizedWorkspaceMode, workspace]);

  const requestWorkspaceMode = React.useCallback((nextMode: 'browse' | 'edit' | 'csv') => {
    if (!workspace?.onModeChange) {
      return;
    }

    if (!browseModeEnabled && nextMode === 'browse') {
      discardDraftChanges('edit');
      return;
    }

    if (!hasDraftEditing) {
      workspace.onModeChange(!browseModeEnabled && nextMode === 'browse' ? 'edit' : nextMode);
      return;
    }

    if (nextMode === 'browse') {
      discardDraftChanges('browse');
      return;
    }

    if (normalizedWorkspaceMode === 'csv') {
      const parsed = getCachedDraftCsvParse(csvDraftTextState, draftRowsState);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        setCsvValidationState('invalid');
        return;
      }

      setDraftRowsState(parsed.rows);
      setCsvErrors([]);
      setCsvValidationState('valid');
      if (nextMode === 'edit') {
        workspace.onModeChange('edit');
        return;
      }
      setCsvDraftTextState(buildDraftCsvText(parsed.rows));
      workspace.onModeChange('csv');
      return;
    }

    if (nextMode === 'edit') {
      replaceDraftRows(rows);
      setCsvErrors([]);
      setCsvValidationState('idle');
      workspace.onModeChange('edit');
      return;
    }

    const nextDraftRows = normalizedWorkspaceMode === 'edit' ? cloneRows(draftRowsState) : cloneRows(rows);
    setDraftRowsState(nextDraftRows);
    setCsvDraftTextState(buildDraftCsvText(nextDraftRows));
    setCsvErrors([]);
    setCsvValidationState('idle');
    cachedCsvParseRef.current = null;
    workspace.onModeChange('csv');
  }, [browseModeEnabled, buildDraftCsvText, csvDraftTextState, discardDraftChanges, draftRowsState, getCachedDraftCsvParse, hasDraftEditing, normalizedWorkspaceMode, replaceDraftRows, rows, workspace]);

  const handleAddDraftRow = React.useCallback(() => {
    if (!draftConfig?.createRow) {
      return;
    }
    setDraftRows((current) => [cloneRow(draftConfig.createRow!(current)), ...current]);
  }, [draftConfig, setDraftRows]);

  React.useEffect(() => {
    cachedCsvParseRef.current = null;
  }, [draftRowsState, draftEditableColumns, draftConfig]);

  React.useEffect(() => {
    if (!hasDraftEditing || normalizedWorkspaceMode !== 'csv') {
      setCsvValidationState('idle');
      return;
    }

    setCsvValidationState('validating');
    const timeoutId = window.setTimeout(() => {
      const parsed = getCachedDraftCsvParse(csvDraftTextState, draftRowsState);
      setCsvValidationState(parsed.errors.length > 0 ? 'invalid' : 'valid');
    }, CSV_PARSE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [csvDraftTextState, draftRowsState, getCachedDraftCsvParse, hasDraftEditing, normalizedWorkspaceMode]);

  React.useEffect(() => {
    if (!hasDraftEditing || isDraftDirty) {
      return;
    }

    setDraftRowsState(cloneRows(rows));

    if (normalizedWorkspaceMode === 'csv') {
      setCsvDraftTextState(buildDraftCsvText(rows));
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
    setCsvDraftTextState('');
    setCsvErrors([]);
    setCsvValidationState('idle');
  }, [hasDraftEditing, normalizedWorkspaceMode, replaceDraftRows, rows]);

  return {
    activeRows,
    applyDraftChanges,
    csvDraftText: csvDraftTextState,
    csvErrors,
    csvValidationState,
    discardDraftChanges,
    draftConfig,
    draftRows: draftRowsState,
    effectiveEditMode,
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
    handleApplyDraftChanges: applyDraftChanges,
  };
}
