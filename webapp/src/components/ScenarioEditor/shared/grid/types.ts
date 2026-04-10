import type React from 'react';

/**
 * `ScenarioDataGrid` stays generic by keeping section-specific bulk semantics in the host.
 * Hosts may swap rows/columns by mode (browse/edit/csv), while the shared grid owns
 * the mode controls and inline CSV surface.
 */
export type ScenarioDataGridWorkspaceMode = 'browse' | 'edit' | 'csv';

export interface ScenarioDataGridInlineCsvConfig {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  helperText?: React.ReactNode;
}

export interface ScenarioDataGridWorkspaceConfig {
  mode: ScenarioDataGridWorkspaceMode;
  onModeChange: (mode: ScenarioDataGridWorkspaceMode) => void;
  csv?: ScenarioDataGridInlineCsvConfig;
  editLabel?: string;
  doneEditingLabel?: string;
  csvLabel?: string;
  toolbarActions?: React.ReactNode | ((mode: ScenarioDataGridWorkspaceMode) => React.ReactNode);
}

export interface ScenarioDataGridOption {
  value: string;
  label: string;
}

export interface ScenarioDataGridNumberRangeValue {
  min?: string;
  max?: string;
}

export type ScenarioDataGridTextFilterValue = string[];

export type ScenarioDataGridSelectFilterValue = string[];

export interface ScenarioDataGridColumnFilter<T> {
  type: 'text' | 'select' | 'numberRange';
  getValue?: (row: T) => string | string[] | number | undefined;
  options?: ScenarioDataGridOption[] | ((rows: T[]) => ScenarioDataGridOption[]);
  placeholder?: string;
  ariaLabel?: string;
}

export interface ScenarioDataGridColumnEditor<T> {
  type: 'text' | 'number' | 'select' | 'multiselect';
  getValue: (row: T) => string | number | string[] | undefined;
  onCommit: (row: T, value: string | number | string[]) => void;
  options?: ScenarioDataGridOption[] | ((row: T) => ScenarioDataGridOption[]);
  parseValue?: (value: string | string[], row: T) => string | number | string[];
  ariaLabel?: string | ((row: T) => string);
  placeholder?: string;
  disabled?: (row: T) => boolean;
}

export interface ScenarioDataGridColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
  exportValue?: (row: T) => string | number | string[] | undefined;
  filter?: ScenarioDataGridColumnFilter<T>;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  hideable?: boolean;
  editor?: ScenarioDataGridColumnEditor<T>;
}
