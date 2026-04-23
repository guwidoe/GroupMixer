import React from 'react';

interface UseGridViewportResizeArgs {
  bodyScrollRef: React.RefObject<HTMLDivElement | null>;
  minHeight?: number;
  bottomViewportMargin?: number;
  keyboardStep?: number;
}

export function useGridViewportResize({
  bodyScrollRef,
  minHeight = 220,
  bottomViewportMargin = 96,
  keyboardStep = 48,
}: UseGridViewportResizeArgs) {
  const resizeStateRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const [viewportHeight, setViewportHeight] = React.useState<number | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);

  const clampHeight = React.useCallback((nextHeight: number) => {
    const bodyNode = bodyScrollRef.current;
    const top = bodyNode?.getBoundingClientRect().top ?? 0;
    const maxHeight = Math.max(minHeight, window.innerHeight - top - bottomViewportMargin);
    return Math.max(minHeight, Math.min(nextHeight, maxHeight));
  }, [bodyScrollRef, bottomViewportMargin, minHeight]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      setViewportHeight(clampHeight(resizeState.startHeight + (event.clientY - resizeState.startY)));
    };

    const handlePointerUp = () => {
      if (!resizeStateRef.current) {
        return;
      }

      resizeStateRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [clampHeight]);

  React.useEffect(() => {
    if (!isResizing) {
      return;
    }

    const previousCursor = document.documentElement.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.documentElement.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.documentElement.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing]);

  const startViewportResize = React.useCallback((clientY: number) => {
    const startHeight = bodyScrollRef.current?.clientHeight;
    if (!startHeight) {
      return;
    }

    resizeStateRef.current = { startY: clientY, startHeight };
    setViewportHeight(startHeight);
    setIsResizing(true);
  }, [bodyScrollRef]);

  const resetViewportHeight = React.useCallback(() => {
    resizeStateRef.current = null;
    setViewportHeight(null);
    setIsResizing(false);
  }, []);

  const handleResizeKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    const currentHeight = viewportHeight ?? bodyScrollRef.current?.clientHeight;
    if (!currentHeight) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      resetViewportHeight();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setViewportHeight(minHeight);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setViewportHeight(clampHeight(Number.MAX_SAFE_INTEGER));
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setViewportHeight(clampHeight(currentHeight + (direction * keyboardStep)));
  }, [bodyScrollRef, clampHeight, keyboardStep, minHeight, resetViewportHeight, viewportHeight]);

  return {
    handleResizeKeyDown,
    isResizing,
    resetViewportHeight,
    startViewportResize,
    viewportHeight,
  };
}
