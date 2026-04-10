import type React from 'react';

/**
 * Typed-grid unification doctrine for ScenarioDataGrid:
 *
 * - We want ONE shared grid component.
 * - Data columns should be expressed in terms of a small set of typed primitives.
 * - Those primitives must work in browse, edit, and csv modes.
 * - Host pages should describe rows/columns and commit behavior, not reinvent CSV/editing systems.
 *
 * Supported data primitives:
 * - string
 * - number
 * - array
 * - enum string
 *
 * Display-only columns such as action buttons remain allowed through a dedicated display-column shape.
 */

export type ScenarioDataGridWorkspaceMode = 'browse' | 'edit' | 'csv';

export interface ScenarioDataGridInlineCsvConfig {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  helperText?: React.ReactNode;
}

export interface ScenarioDataGridDraftCsvConfig {
  ariaLabel?: string;
  placeholder?: string;
  helperText?: React.ReactNode;
}

export interface ScenarioDataGridDraftConfig<T> {
  onApply: (rows: T[]) => void;
  createRow?: () => T;
  csv?: ScenarioDataGridDraftCsvConfig;
}

export interface ScenarioDataGridWorkspaceConfig<T = unknown> {
  mode: ScenarioDataGridWorkspaceMode;
  onModeChange: (mode: ScenarioDataGridWorkspaceMode) => void;
  draft?: ScenarioDataGridDraftConfig<T>;
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

export type ScenarioDataGridPrimitiveType = 'string' | 'number' | 'array' | 'enum';
export type ScenarioDataGridArrayItemType = 'string' | 'number';

export interface ScenarioDataGridColumnBase<T> {
  id: string;
  header: string;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  hideable?: boolean;
}

export interface ScenarioDataGridPrimitiveCsvConfig {
  /**
   * Stable delimiter used when the grid serializes array values into a CSV cell.
   * Default target separator should remain `|` so commas stay available for CSV itself.
   */
  separator?: string;
  /**
   * Extra delimiters accepted while parsing user-authored CSV back into typed values.
   * This allows forgiving input (`|`, `;`, or `,`) while still writing one stable format.
   */
  acceptedSeparators?: string[];
}

export interface ScenarioDataGridPrimitiveBase<T, TValue> extends ScenarioDataGridColumnBase<T> {
  kind: 'primitive';
  primitive: ScenarioDataGridPrimitiveType;
  getValue: (row: T) => TValue | undefined;
  sortValue?: (value: TValue | undefined, row: T) => string | number;
  /**
   * Returns the updated row after applying an edited or CSV-parsed typed value.
   * The grid should use this in edit/csv workflows instead of delegating row mutation to page-local bulk UIs.
   */
  setValue?: (row: T, value: TValue | undefined) => T;
  /**
   * Optional custom browse-mode rendering. If omitted, the grid should render a sensible default for the primitive.
   */
  renderValue?: (value: TValue | undefined, row: T) => React.ReactNode;
  /**
   * Optional search text override. If omitted, the grid should derive search/filter/export text from the typed value.
   */
  searchText?: (value: TValue | undefined, row: T) => string;
  exportValue?: (value: TValue | undefined, row: T) => string | number | string[] | undefined;
  parseValue?: (value: string, row: T) => TValue | undefined;
  filter?: ScenarioDataGridColumnFilter<T>;
  csv?: ScenarioDataGridPrimitiveCsvConfig;
}

export interface ScenarioDataGridStringColumn<T>
  extends ScenarioDataGridPrimitiveBase<T, string> {
  primitive: 'string';
  placeholder?: string;
}

export interface ScenarioDataGridNumberColumn<T>
  extends ScenarioDataGridPrimitiveBase<T, number> {
  primitive: 'number';
  placeholder?: string;
}

export interface ScenarioDataGridArrayColumn<T>
  extends ScenarioDataGridPrimitiveBase<T, Array<string | number>> {
  primitive: 'array';
  itemType?: ScenarioDataGridArrayItemType;
  /**
   * Optional constrained option set for array values. When present, edit mode should use
   * a multi-select style editor and CSV parsing should validate each token.
   */
  options?: ScenarioDataGridOption[] | ((row: T) => ScenarioDataGridOption[]);
}

export interface ScenarioDataGridEnumColumn<T>
  extends ScenarioDataGridPrimitiveBase<T, string> {
  primitive: 'enum';
  options: ScenarioDataGridOption[] | ((row: T) => ScenarioDataGridOption[]);
  placeholder?: string;
}

export interface ScenarioDataGridDisplayColumn<T> extends ScenarioDataGridColumnBase<T> {
  kind: 'display';
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
  exportValue?: (row: T) => string | number | string[] | undefined;
  filter?: ScenarioDataGridColumnFilter<T>;
  editor?: ScenarioDataGridColumnEditor<T>;
}

/**
 * Transitional legacy shape. This stays supported while sections migrate to the typed primitive model.
 * New data columns should prefer the typed primitive variants above.
 */
export interface ScenarioDataGridLegacyColumn<T> extends ScenarioDataGridColumnBase<T> {
  kind?: undefined;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
  exportValue?: (row: T) => string | number | string[] | undefined;
  filter?: ScenarioDataGridColumnFilter<T>;
  editor?: ScenarioDataGridColumnEditor<T>;
}

export type ScenarioDataGridPrimitiveColumn<T> =
  | ScenarioDataGridStringColumn<T>
  | ScenarioDataGridNumberColumn<T>
  | ScenarioDataGridArrayColumn<T>
  | ScenarioDataGridEnumColumn<T>;

export type ScenarioDataGridColumn<T> =
  | ScenarioDataGridPrimitiveColumn<T>
  | ScenarioDataGridDisplayColumn<T>
  | ScenarioDataGridLegacyColumn<T>;
