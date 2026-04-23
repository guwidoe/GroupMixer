import React from 'react';

const DEFAULT_ROW_HEIGHT = 52;
const DEFAULT_VIEWPORT_HEIGHT = 480;
const DEFAULT_OVERSCAN = 6;
const MIN_VIRTUALIZED_ROW_COUNT = 40;

interface UseGridRowVirtualizationArgs {
  bodyScrollRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  rowCount: number;
  viewportHeight?: number | null;
}

export function useGridRowVirtualization({
  bodyScrollRef,
  enabled,
  rowCount,
  viewportHeight,
}: UseGridRowVirtualizationArgs) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [measuredViewportHeight, setMeasuredViewportHeight] = React.useState(0);
  const [rowHeight, setRowHeight] = React.useState(DEFAULT_ROW_HEIGHT);
  const rowHeightRef = React.useRef(DEFAULT_ROW_HEIGHT);

  const updateViewportMetrics = React.useCallback(() => {
    const bodyNode = bodyScrollRef.current;
    if (!bodyNode) {
      setMeasuredViewportHeight(viewportHeight ?? 0);
      setScrollTop(0);
      return;
    }

    setMeasuredViewportHeight(bodyNode.clientHeight || viewportHeight || DEFAULT_VIEWPORT_HEIGHT);
    setScrollTop(bodyNode.scrollTop);
  }, [bodyScrollRef, viewportHeight]);

  React.useEffect(() => {
    if (!enabled) {
      setScrollTop(0);
      return;
    }

    updateViewportMetrics();

    const bodyNode = bodyScrollRef.current;
    if (!bodyNode) {
      return;
    }

    const handleScroll = () => setScrollTop(bodyNode.scrollTop);
    const handleResize = () => updateViewportMetrics();

    bodyNode.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleResize);
    observer?.observe(bodyNode);

    return () => {
      bodyNode.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [bodyScrollRef, enabled, rowCount, updateViewportMetrics]);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    updateViewportMetrics();
  }, [enabled, rowCount, updateViewportMetrics]);

  const measureRow = React.useCallback((node: HTMLTableRowElement | null) => {
    if (!node) {
      return;
    }

    const nextRowHeight = Math.round(node.getBoundingClientRect().height);
    if (nextRowHeight < 32 || Math.abs(nextRowHeight - rowHeightRef.current) <= 1) {
      return;
    }

    rowHeightRef.current = nextRowHeight;
    setRowHeight(nextRowHeight);
  }, []);

  const resolvedViewportHeight = measuredViewportHeight || viewportHeight || DEFAULT_VIEWPORT_HEIGHT;
  const isVirtualized = enabled && rowCount > MIN_VIRTUALIZED_ROW_COUNT;

  if (!isVirtualized || rowCount === 0) {
    return {
      bottomSpacerHeight: 0,
      isVirtualized,
      measureRow,
      topSpacerHeight: 0,
      visibleRowEndIndex: rowCount - 1,
      visibleRowStartIndex: 0,
    };
  }

  const visibleRowCount = Math.ceil(resolvedViewportHeight / rowHeight) + (DEFAULT_OVERSCAN * 2);
  const visibleRowStartIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - DEFAULT_OVERSCAN);
  const visibleRowEndIndex = Math.min(rowCount - 1, visibleRowStartIndex + visibleRowCount - 1);

  return {
    bottomSpacerHeight: Math.max(0, (rowCount - visibleRowEndIndex - 1) * rowHeight),
    isVirtualized,
    measureRow,
    topSpacerHeight: visibleRowStartIndex * rowHeight,
    visibleRowEndIndex,
    visibleRowStartIndex,
  };
}
