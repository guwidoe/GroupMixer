import React from 'react';
import { estimateHeaderMinWidth } from '../model/layoutUtils';
import type { MaterializedScenarioDataGridColumn } from '../model/columnMaterialization';

interface UseGridColumnResizeArgs<T> {
  columns: Array<MaterializedScenarioDataGridColumn<T>>;
  setColumnSizing: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export function useGridColumnResize<T>({ columns, setColumnSizing }: UseGridColumnResizeArgs<T>) {
  const resizeStateRef = React.useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const sourceColumn = columns.find((column) => column.id === resizeState.columnId);
      const nextWidth = Math.max(
        sourceColumn ? estimateHeaderMinWidth(sourceColumn) : 120,
        resizeState.startWidth + (event.clientX - resizeState.startX),
      );

      setColumnSizing((current) => ({
        ...current,
        [resizeState.columnId]: nextWidth,
      }));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [columns, setColumnSizing]);

  const startColumnResize = React.useCallback((columnId: string, startX: number, startWidth: number) => {
    resizeStateRef.current = { columnId, startX, startWidth };
  }, []);

  return { startColumnResize };
}
