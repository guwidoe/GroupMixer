import React from 'react';

interface UseAnchoredPopoverPositionArgs {
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  minWidth: number;
  maxWidth: number;
  offset?: number;
  viewportPadding?: number;
  minHeight?: number;
}

export function useAnchoredPopoverPosition({
  isOpen,
  triggerRef,
  panelRef,
  minWidth,
  maxWidth,
  offset = 6,
  viewportPadding = 8,
  minHeight = 160,
}: UseAnchoredPopoverPositionArgs) {
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties | null>(null);

  React.useLayoutEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      setPopoverStyle(null);
      return;
    }

    const updatePopoverPosition = () => {
      const triggerNode = triggerRef.current;
      if (!triggerNode) {
        return;
      }

      const triggerRect = triggerNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const minVisibleWidth = Math.min(minWidth, Math.max(160, viewportWidth - (viewportPadding * 2)));
      const width = Math.min(maxWidth, Math.max(minVisibleWidth, Math.min(triggerRect.width, viewportWidth - (viewportPadding * 2))));
      const maxLeft = Math.max(viewportPadding, viewportWidth - width - viewportPadding);
      const left = Math.min(Math.max(triggerRect.left, viewportPadding), maxLeft);
      const measuredHeight = panelRef.current?.offsetHeight ?? 0;
      const preferredTop = triggerRect.bottom + offset;
      const availableBelow = viewportHeight - preferredTop - viewportPadding;
      const availableAbove = triggerRect.top - offset - viewportPadding;
      const shouldPlaceAbove = measuredHeight > 0
        && availableBelow < Math.min(measuredHeight, Math.max(minHeight, 220))
        && availableAbove > availableBelow;
      const top = shouldPlaceAbove
        ? Math.max(viewportPadding, triggerRect.top - measuredHeight - offset)
        : Math.max(viewportPadding, Math.min(preferredTop, viewportHeight - Math.max(Math.min(measuredHeight, viewportHeight - (viewportPadding * 2)), minHeight) - viewportPadding));
      const maxHeight = shouldPlaceAbove
        ? Math.max(minHeight, triggerRect.top - offset - viewportPadding)
        : Math.max(minHeight, viewportHeight - preferredTop - viewportPadding);

      setPopoverStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
        maxHeight: `${maxHeight}px`,
        zIndex: 90,
      });
    };

    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => updatePopoverPosition());
    if (resizeObserver) {
      if (triggerRef.current) {
        resizeObserver.observe(triggerRef.current);
      }
      if (panelRef.current) {
        resizeObserver.observe(panelRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
      resizeObserver?.disconnect();
    };
  }, [isOpen, maxWidth, minHeight, minWidth, offset, panelRef, triggerRef, viewportPadding]);

  return popoverStyle;
}
