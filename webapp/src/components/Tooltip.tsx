import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  placement?: TooltipPlacement;
  disabled?: boolean;
  offset?: number;
  maxWidth?: number;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: TooltipPlacement;
}

const VIEWPORT_PADDING = 12;
const DEFAULT_OFFSET = 10;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function composeEventHandlers<E>(
  original: ((event: E) => void) | undefined,
  next: (event: E) => void,
) {
  return (event: E) => {
    original?.(event);
    next(event);
  };
}

function getPlacementOrder(preferred: TooltipPlacement): TooltipPlacement[] {
  switch (preferred) {
    case 'bottom':
      return ['bottom', 'top', 'right', 'left'];
    case 'left':
      return ['left', 'right', 'top', 'bottom'];
    case 'right':
      return ['right', 'left', 'top', 'bottom'];
    case 'top':
    default:
      return ['top', 'bottom', 'right', 'left'];
  }
}

function selectPlacement(
  triggerRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
  preferred: TooltipPlacement,
  offset: number,
): TooltipPlacement {
  const spaces = {
    top: triggerRect.top - VIEWPORT_PADDING,
    bottom: window.innerHeight - triggerRect.bottom - VIEWPORT_PADDING,
    left: triggerRect.left - VIEWPORT_PADDING,
    right: window.innerWidth - triggerRect.right - VIEWPORT_PADDING,
  };

  const requiredSpace = {
    top: tooltipHeight + offset,
    bottom: tooltipHeight + offset,
    left: tooltipWidth + offset,
    right: tooltipWidth + offset,
  };

  const order = getPlacementOrder(preferred);
  const fittingPlacement = order.find((placement) => spaces[placement] >= requiredSpace[placement]);
  if (fittingPlacement) {
    return fittingPlacement;
  }

  return order.reduce((bestPlacement, placement) => {
    if (spaces[placement] > spaces[bestPlacement]) {
      return placement;
    }
    return bestPlacement;
  }, order[0]);
}

function computePosition(
  triggerRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
  preferredPlacement: TooltipPlacement,
  offset: number,
): TooltipPosition {
  const placement = selectPlacement(triggerRect, tooltipWidth, tooltipHeight, preferredPlacement, offset);
  const centerX = triggerRect.left + triggerRect.width / 2;
  const centerY = triggerRect.top + triggerRect.height / 2;
  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - tooltipWidth - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - tooltipHeight - VIEWPORT_PADDING);

  switch (placement) {
    case 'bottom':
      return {
        placement,
        top: clamp(triggerRect.bottom + offset, VIEWPORT_PADDING, maxTop),
        left: clamp(centerX - tooltipWidth / 2, VIEWPORT_PADDING, maxLeft),
      };
    case 'left':
      return {
        placement,
        top: clamp(centerY - tooltipHeight / 2, VIEWPORT_PADDING, maxTop),
        left: clamp(triggerRect.left - tooltipWidth - offset, VIEWPORT_PADDING, maxLeft),
      };
    case 'right':
      return {
        placement,
        top: clamp(centerY - tooltipHeight / 2, VIEWPORT_PADDING, maxTop),
        left: clamp(triggerRect.right + offset, VIEWPORT_PADDING, maxLeft),
      };
    case 'top':
    default:
      return {
        placement,
        top: clamp(triggerRect.top - tooltipHeight - offset, VIEWPORT_PADDING, maxTop),
        left: clamp(centerX - tooltipWidth / 2, VIEWPORT_PADDING, maxLeft),
      };
  }
}

export function Tooltip({
  content,
  children,
  className,
  placement = 'top',
  disabled = false,
  offset = DEFAULT_OFFSET,
  maxWidth = 320,
}: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = tooltipRef.current.offsetWidth;
    const tooltipHeight = tooltipRef.current.offsetHeight;

    if (tooltipWidth === 0 || tooltipHeight === 0) {
      return;
    }

    setPosition(computePosition(triggerRect, tooltipWidth, tooltipHeight, placement, offset));
  }, [offset, placement]);

  useLayoutEffect(() => {
    if (!isVisible) {
      return;
    }

    updatePosition();

    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [isVisible, updatePosition]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isVisible, updatePosition]);

  const showTooltip = useCallback(() => {
    if (disabled || content == null) {
      return;
    }
    setIsVisible(true);
  }, [content, disabled]);

  const hideTooltip = useCallback(() => {
    setIsVisible(false);
    setPosition(null);
  }, []);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
        return;
      }

      hideTooltip();
    };

    document.addEventListener('mousedown', handleOutsideInteraction);
    document.addEventListener('touchstart', handleOutsideInteraction, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction);
      document.removeEventListener('touchstart', handleOutsideInteraction);
    };
  }, [hideTooltip, isVisible]);

  const wrapperClassName = className ?? 'inline-flex items-center';
  const tooltipMaxWidth = typeof window === 'undefined'
    ? maxWidth
    : Math.min(maxWidth, window.innerWidth - VIEWPORT_PADDING * 2);
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
      onMouseEnter: composeEventHandlers((children.props as any).onMouseEnter, showTooltip),
      onFocus: composeEventHandlers((children.props as any).onFocus, showTooltip),
      onBlur: composeEventHandlers((children.props as any).onBlur, hideTooltip),
      onPointerDown: composeEventHandlers((children.props as any).onPointerDown, showTooltip),
      onTouchStart: composeEventHandlers((children.props as any).onTouchStart, showTooltip),
      onClick: composeEventHandlers((children.props as any).onClick, showTooltip),
      'aria-describedby': isVisible ? tooltipId : (children.props as any)['aria-describedby'],
    })
    : children;

  return (
    <>
      <span
        ref={triggerRef}
        className={wrapperClassName}
        onMouseLeave={hideTooltip}
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        {child}
      </span>

      {isVisible && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          data-placement={position?.placement ?? placement}
          className="pointer-events-none fixed z-[90] rounded-md border px-2.5 py-2 text-xs font-medium shadow-lg"
          style={{
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            maxWidth: tooltipMaxWidth,
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            borderColor: 'var(--tooltip-border)',
            boxShadow: 'var(--tooltip-shadow)',
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          <div className="whitespace-normal break-words leading-5">{content}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
