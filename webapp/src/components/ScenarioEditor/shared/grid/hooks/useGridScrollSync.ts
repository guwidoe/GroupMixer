import React from 'react';

interface UseGridScrollSyncArgs {
  deps: React.DependencyList;
}

export function hasScrollMetricChange(
  current: { scrollWidth: number; clientWidth: number },
  next: { scrollWidth: number; clientWidth: number },
) {
  return current.scrollWidth !== next.scrollWidth || current.clientWidth !== next.clientWidth;
}

export function useGridScrollSync({ deps }: UseGridScrollSyncArgs) {
  const [scrollMetrics, setScrollMetrics] = React.useState({ scrollWidth: 0, clientWidth: 0 });
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const syncingScrollRef = React.useRef<'top' | 'body' | null>(null);

  const syncScroll = React.useCallback((source: 'top' | 'body') => {
    const topNode = topScrollRef.current;
    const bodyNode = bodyScrollRef.current;
    if (!topNode || !bodyNode || syncingScrollRef.current === source) {
      return;
    }

    syncingScrollRef.current = source;
    if (source === 'top') {
      bodyNode.scrollLeft = topNode.scrollLeft;
    } else {
      topNode.scrollLeft = bodyNode.scrollLeft;
    }

    window.requestAnimationFrame(() => {
      syncingScrollRef.current = null;
    });
  }, []);

  React.useEffect(() => {
    const updateScrollMetrics = () => {
      const bodyNode = bodyScrollRef.current;
      const tableNode = tableRef.current;
      if (!bodyNode || !tableNode) {
        return;
      }

      const nextMetrics = {
        scrollWidth: tableNode.scrollWidth,
        clientWidth: bodyNode.clientWidth,
      };

      setScrollMetrics((current) => (hasScrollMetricChange(current, nextMetrics) ? nextMetrics : current));
    };

    updateScrollMetrics();

    const tableNode = tableRef.current;
    const bodyNode = bodyScrollRef.current;
    if (typeof ResizeObserver === 'undefined' || !tableNode || !bodyNode) {
      return;
    }

    const observer = new ResizeObserver(updateScrollMetrics);
    observer.observe(tableNode);
    observer.observe(bodyNode);
    return () => observer.disconnect();
  }, deps);

  return {
    bodyScrollRef,
    scrollMetrics,
    syncScroll,
    tableRef,
    topScrollRef,
  };
}
