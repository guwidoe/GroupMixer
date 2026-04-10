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
 * - structured finite-key fields that expand into typed subcolumns
 * - custom structured values with explicit raw codecs
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

export type ScenarioDataGridRawParseResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: string };

/**
 * Raw codecs govern CSV / raw-table round-tripping.
 *
 * Important doctrine:
 * - browse rendering and edit rendering are separate concerns from raw serialization
 * - simple scalar columns may keep lightweight scalar codecs
 * - array/map/object-like values should prefer JSON raw codecs
 * - parse failures must stay explicit; no silent coercion or delimiter magic for arbitrary user strings
 */
export interface ScenarioDataGridRawCodec<TValue, TRow> {
  format: (value: TValue | undefined, row: TRow) => string;
  parse: (text: string, row: TRow) => ScenarioDataGridRawParseResult<TValue | undefined>;
}

export interface ScenarioDataGridCustomEditorArgs<T, TValue> {
  row: T;
  value: TValue | undefined;
  onCommit: (value: TValue | undefined) => void;
  disabled?: boolean;
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
export type ScenarioDataGridStructuredChildPrimitiveType = 'string' | 'number' | 'enum';

export interface ScenarioDataGridColumnBase {
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
   *
   * Transitional note:
   * - this is only safe when array items are guaranteed not to contain arbitrary separator text
   * - array columns with user-supplied string members should prefer an explicit JSON raw codec instead
   */
  separator?: string;
  /**
   * Extra delimiters accepted while parsing user-authored CSV back into typed values.
   * This allows forgiving input (`|`, `;`, or `,`) while still writing one stable format.
   *
   * Transitional note:
   * - this compatibility path should not be extended to new complex/user-text-heavy fields
   * - prefer JSON raw codecs for arrays/maps with arbitrary strings
   */
  acceptedSeparators?: string[];
}

export interface ScenarioDataGridPrimitiveBase<T, TValue> extends ScenarioDataGridColumnBase {
  kind: 'primitive';
  primitive: ScenarioDataGridPrimitiveType;
  getValue: (row: T) => TValue | undefined;
  disabled?: (row: T) => boolean;
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
  /**
   * Optional raw codec override for CSV / raw editing.
   *
   * Use this when the browse/edit UI remains primitive-like but the raw representation must be safer
   * than the primitive default, e.g. JSON arrays for user-supplied string lists.
   */
  rawCodec?: ScenarioDataGridRawCodec<TValue, T>;
  filter?: ScenarioDataGridColumnFilter<T>;
  csv?: ScenarioDataGridPrimitiveCsvConfig;
}

/**
 * Structured finite-key fields are the next layer of reuse after primitive columns.
 *
 * Use this when one logical field is conceptually a map, but the key set is known at render time.
 *
 * Preferred shape for GroupMixer:
 * - expand one logical structured field into multiple typed child columns
 * - each child column behaves like a normal primitive in browse/edit/csv
 * - CSV stays spreadsheet-friendly because the keys become explicit columns
 *
 * Explicit non-goal:
 * - do not default to opaque dictionary/blob cells for known finite-key data
 */
export interface ScenarioDataGridStructuredFiniteKeyColumnBase<T, TValue extends string | number>
  extends ScenarioDataGridColumnBase {
  kind: 'structured';
  structured: 'finite-key-map';
  childPrimitive: ScenarioDataGridStructuredChildPrimitiveType;
  /**
   * Logical label for the grouped field. The individual child headers come from `keys`.
   */
  header: string;
  /**
   * Known finite keys available at render time. The grid expands one child column per key.
   */
  keys: ScenarioDataGridOption[] | ((rows: T[]) => ScenarioDataGridOption[]);
  getValue: (row: T, key: string) => TValue | undefined;
  setValue?: (row: T, key: string, value: TValue | undefined) => T;
  /**
   * Optional per-row availability gate. Disabled/irrelevant child cells should stay visible
   * as explicit columns rather than disappearing entirely.
   */
  isKeyAvailable?: (row: T, key: string) => boolean;
  renderValue?: (value: TValue | undefined, row: T, key: string) => React.ReactNode;
  searchText?: (value: TValue | undefined, row: T, key: string) => string;
  exportValue?: (value: TValue | undefined, row: T, key: string) => string | number | undefined;
  parseValue?: (value: string, row: T, key: string) => TValue | undefined;
  childWidth?: number;
  childMinWidth?: number;
  childPlaceholder?: string | ((key: ScenarioDataGridOption) => string);
}

/**
 * Row-local structured values should use a custom column instead of pretending they are a shared table-global schema.
 *
 * Preferred use cases:
 * - map/dictionary values whose keys depend on another field in the same row
 * - richer objects that need a custom browse renderer and custom editor UI
 * - values that should round-trip through raw mode using canonical JSON
 */
export interface ScenarioDataGridCustomColumn<T, TValue> extends ScenarioDataGridColumnBase {
  kind: 'custom';
  getValue: (row: T) => TValue | undefined;
  setValue?: (row: T, value: TValue | undefined) => T;
  renderValue: (value: TValue | undefined, row: T) => React.ReactNode;
  renderEditor?: (args: ScenarioDataGridCustomEditorArgs<T, TValue>) => React.ReactNode;
  sortValue?: (value: TValue | undefined, row: T) => string | number;
  searchText?: (value: TValue | undefined, row: T) => string;
  exportValue?: (value: TValue | undefined, row: T) => string | number | string[] | undefined;
  rawCodec?: ScenarioDataGridRawCodec<TValue, T>;
  filter?: ScenarioDataGridColumnFilter<T>;
  disabled?: (row: T) => boolean;
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

export interface ScenarioDataGridStructuredFiniteKeyNumberColumn<T>
  extends ScenarioDataGridStructuredFiniteKeyColumnBase<T, number> {
  childPrimitive: 'number';
}

export interface ScenarioDataGridStructuredFiniteKeyStringColumn<T>
  extends ScenarioDataGridStructuredFiniteKeyColumnBase<T, string> {
  childPrimitive: 'string';
}

export interface ScenarioDataGridStructuredFiniteKeyEnumColumn<T>
  extends ScenarioDataGridStructuredFiniteKeyColumnBase<T, string> {
  childPrimitive: 'enum';
  childOptions: ScenarioDataGridOption[] | ((args: { row: T; key: string }) => ScenarioDataGridOption[]);
}

export interface ScenarioDataGridDisplayColumn<T> extends ScenarioDataGridColumnBase {
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
export interface ScenarioDataGridLegacyColumn<T> extends ScenarioDataGridColumnBase {
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

export type ScenarioDataGridStructuredColumn<T> =
  | ScenarioDataGridStructuredFiniteKeyNumberColumn<T>
  | ScenarioDataGridStructuredFiniteKeyStringColumn<T>
  | ScenarioDataGridStructuredFiniteKeyEnumColumn<T>;

export type ScenarioDataGridColumn<T> =
  | ScenarioDataGridPrimitiveColumn<T>
  | ScenarioDataGridStructuredColumn<T>
  | ScenarioDataGridCustomColumn<T, unknown>
  | ScenarioDataGridDisplayColumn<T>
  | ScenarioDataGridLegacyColumn<T>;
