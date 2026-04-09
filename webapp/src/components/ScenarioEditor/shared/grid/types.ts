import type React from 'react';

export interface ScenarioDataGridOption {
  value: string;
  label: string;
}

export interface ScenarioDataGridNumberRangeValue {
  min?: string;
  max?: string;
}

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
  filter?: ScenarioDataGridColumnFilter<T>;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  hideable?: boolean;
  editor?: ScenarioDataGridColumnEditor<T>;
}
