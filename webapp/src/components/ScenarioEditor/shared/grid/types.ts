import type React from 'react';

export interface ScenarioDataGridColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  hideable?: boolean;
}
