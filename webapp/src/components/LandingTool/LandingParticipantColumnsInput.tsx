import { X } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { QuickSetupParticipantColumn } from './types';
import { splitParticipantColumnValues } from '../../utils/quickSetup/participantColumns';

interface LandingParticipantColumnsInputProps {
  label: string;
  nameColumnLabel: string;
  nameColumnPlaceholder: string;
  addAttributeLabel: string;
  ghostAttributeDisplayLabel: string;
  attributeNamePlaceholder: string;
  ghostAttributeValuesPreview: string;
  removeAttributeLabel: string;
  columns: QuickSetupParticipantColumn[];
  onChangeColumnName: (index: number, value: string) => void;
  onChangeColumnValues: (index: number, value: string) => void;
  onAddAttribute: () => string | null;
  onRemoveAttribute: (index: number) => void;
  minHeight: number;
}

interface EditableTextBlockProps {
  className: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  multiline?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  inputRef?: (node: HTMLDivElement | null) => void;
  dataFocusTarget?: boolean;
  focusToken?: number | null;
}

const NAME_COLUMN_WIDTH = 120;
const ATTRIBUTE_COLUMN_WIDTH = 140;
const MIN_NAME_WIDTH = 96;
const MIN_ATTRIBUTE_WIDTH = 64;
const HEADER_HEIGHT = 32;
const LINE_HEIGHT = 26;
const BODY_PADDING = 18;

function readEditableValue(element: HTMLDivElement) {
  const rawValue = typeof element.innerText === 'string'
    ? element.innerText
    : (element.textContent ?? '');

  return rawValue.replace(/\n+$/g, '');
}

function focusEditableAtStart(element: HTMLDivElement) {
  element.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function EditableTextBlock({
  className,
  value,
  onChange,
  ariaLabel,
  multiline = false,
  placeholder,
  style,
  onKeyDown,
  inputRef,
  dataFocusTarget = false,
  focusToken = null,
}: EditableTextBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    inputRef?.(node);
  }, [inputRef]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    if (document.activeElement === element) {
      return;
    }

    const currentValue = readEditableValue(element);
    if (currentValue !== value) {
      element.textContent = value;
    }
  }, [value]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (focusToken == null || !element) {
      return;
    }

    focusEditableAtStart(element);
  }, [focusToken]);

  return (
    <div
      ref={setRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline || undefined}
      className={className}
      data-placeholder={placeholder ?? ''}
      data-empty={value.length === 0 ? 'true' : 'false'}
      data-ghost-focus-target={dataFocusTarget ? 'true' : undefined}
      onInput={(event) => onChange(readEditableValue(event.currentTarget))}
      onBlur={(event) => {
        event.currentTarget.scrollLeft = 0;
      }}
      onKeyDown={onKeyDown}
      style={style}
    />
  );
}

export function LandingParticipantColumnsInput({
  label,
  nameColumnLabel,
  nameColumnPlaceholder,
  addAttributeLabel,
  ghostAttributeDisplayLabel,
  attributeNamePlaceholder,
  ghostAttributeValuesPreview,
  removeAttributeLabel,
  columns,
  onChangeColumnName,
  onChangeColumnValues,
  onAddAttribute,
  onRemoveAttribute,
  minHeight,
}: LandingParticipantColumnsInputProps) {
  const [height, setHeight] = useState(minHeight);
  const [columnWidths, setColumnWidths] = useState<number[]>(() => columns.map((_, index) => (index === 0 ? NAME_COLUMN_WIDTH : ATTRIBUTE_COLUMN_WIDTH)));
  const [ghostColumnWidth, setGhostColumnWidth] = useState(ATTRIBUTE_COLUMN_WIDTH);
  const [pendingFocusRequest, setPendingFocusRequest] = useState<{ columnId: string; token: number } | null>(null);
  const focusRequestTokenRef = useRef(0);
  const dragStateRef = useRef<{
    startX: number;
    leftWidth: number;
    rightWidth: number;
    index: number;
    rightIsGhost: boolean;
  } | null>(null);
  const resizeDragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const stopColumnResizeRef = useRef<() => void>(() => {});
  const stopResizeRef = useRef<() => void>(() => {});
  const lastGhostPointerActivationAtRef = useRef<number | null>(null);
  const headerInputRefs = useRef(new Map<string, HTMLDivElement>());
  const fulfilledFocusRequestTokenRef = useRef<number | null>(null);

  const focusColumnHeader = useCallback((columnId: string, token?: number) => {
    if (token != null && fulfilledFocusRequestTokenRef.current === token) {
      return true;
    }

    const element = headerInputRefs.current.get(columnId);
    if (!element) {
      return false;
    }

    focusEditableAtStart(element);
    const isFocused = document.activeElement === element;
    if (isFocused && token != null) {
      fulfilledFocusRequestTokenRef.current = token;
    }

    return isFocused;
  }, []);

  const registerHeaderInput = useCallback((columnId: string, node: HTMLDivElement | null) => {
    if (node) {
      headerInputRefs.current.set(columnId, node);

      if (pendingFocusRequest?.columnId === columnId) {
        focusColumnHeader(columnId, pendingFocusRequest.token);
      }
      return;
    }

    headerInputRefs.current.delete(columnId);
  }, [focusColumnHeader, pendingFocusRequest]);

  const maxLineCount = useMemo(() => (
    Math.max(1, ...columns.map((column) => Math.max(1, splitParticipantColumnValues(column.values).length)))
  ), [columns]);

  const contentHeight = Math.max(height - HEADER_HEIGHT - 18, maxLineCount * LINE_HEIGHT + BODY_PADDING);
  const getColumnWidth = useCallback(
    (index: number) => columnWidths[index] ?? (index === 0 ? NAME_COLUMN_WIDTH : ATTRIBUTE_COLUMN_WIDTH),
    [columnWidths],
  );

  const handleColumnPointerMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const delta = event.clientX - dragState.startX;
    const leftMinWidth = dragState.index === 0 ? MIN_NAME_WIDTH : MIN_ATTRIBUTE_WIDTH;
    const rightMinWidth = MIN_ATTRIBUTE_WIDTH;
    const total = dragState.leftWidth + dragState.rightWidth;
    const nextLeftWidth = Math.min(total - rightMinWidth, Math.max(leftMinWidth, dragState.leftWidth + delta));
    const nextRightWidth = total - nextLeftWidth;

    setColumnWidths((previous) => {
      const next = [...previous];
      next[dragState.index] = nextLeftWidth;
      if (!dragState.rightIsGhost) {
        next[dragState.index + 1] = nextRightWidth;
      }
      return next;
    });

    if (dragState.rightIsGhost) {
      setGhostColumnWidth(nextRightWidth);
    }
  }, []);

  const stopColumnResize = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handleColumnPointerMove);
    window.removeEventListener('pointerup', stopColumnResizeRef.current);
    window.removeEventListener('pointercancel', stopColumnResizeRef.current);
  }, [handleColumnPointerMove]);

  const startColumnResize = useCallback((index: number, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rightIsGhost = index === columns.length - 1;
    const leftElement = event.currentTarget.previousElementSibling as HTMLDivElement | null;
    const rightElement = event.currentTarget.nextElementSibling as HTMLDivElement | null;
    const measuredLeftWidth = leftElement?.getBoundingClientRect().width;
    const measuredRightWidth = rightElement?.getBoundingClientRect().width;

    dragStateRef.current = {
      index,
      startX: event.clientX,
      leftWidth: measuredLeftWidth ?? getColumnWidth(index),
      rightWidth: measuredRightWidth ?? (rightIsGhost ? ghostColumnWidth : getColumnWidth(index + 1)),
      rightIsGhost,
    };

    window.addEventListener('pointermove', handleColumnPointerMove);
    window.addEventListener('pointerup', stopColumnResize);
    window.addEventListener('pointercancel', stopColumnResize);
  }, [columns.length, getColumnWidth, ghostColumnWidth, handleColumnPointerMove, stopColumnResize]);

  const handleResizePointerMove = useCallback((event: PointerEvent) => {
    const dragState = resizeDragStateRef.current;
    if (!dragState) {
      return;
    }

    const nextHeight = Math.max(minHeight, dragState.startHeight + (event.clientY - dragState.startY));
    setHeight(nextHeight);
  }, [minHeight]);

  const stopResize = useCallback(() => {
    resizeDragStateRef.current = null;
    window.removeEventListener('pointermove', handleResizePointerMove);
    window.removeEventListener('pointerup', stopResizeRef.current);
    window.removeEventListener('pointercancel', stopResizeRef.current);
  }, [handleResizePointerMove]);

  useEffect(() => {
    stopColumnResizeRef.current = stopColumnResize;
    return stopColumnResize;
  }, [stopColumnResize]);
  useEffect(() => {
    stopResizeRef.current = stopResize;
    return stopResize;
  }, [stopResize]);

  useLayoutEffect(() => {
    if (!pendingFocusRequest) {
      return;
    }

    const { columnId, token } = pendingFocusRequest;
    const timeoutIds: number[] = [];
    const animationFrameId = window.requestAnimationFrame(() => {
      focusColumnHeader(columnId, token);
    });

    focusColumnHeader(columnId, token);
    timeoutIds.push(window.setTimeout(() => {
      focusColumnHeader(columnId, token);
    }, 0));
    timeoutIds.push(window.setTimeout(() => {
      focusColumnHeader(columnId, token);
    }, 50));
    timeoutIds.push(window.setTimeout(() => {
      focusColumnHeader(columnId, token);
    }, 150));

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [focusColumnHeader, pendingFocusRequest]);

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeDragStateRef.current = {
      startY: event.clientY,
      startHeight: height,
    };

    window.addEventListener('pointermove', handleResizePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }, [handleResizePointerMove, height, stopResize]);

  const handleActivateGhostColumn = useCallback(() => {
    let newColumnId: string | null = null;

    flushSync(() => {
      newColumnId = onAddAttribute();
      if (newColumnId) {
        focusRequestTokenRef.current += 1;
        fulfilledFocusRequestTokenRef.current = null;
        setPendingFocusRequest({
          columnId: newColumnId,
          token: focusRequestTokenRef.current,
        });
      }
    });

    if (newColumnId) {
      const focusToken = focusRequestTokenRef.current;
      const focusAfterGesture = () => {
        window.requestAnimationFrame(() => {
          focusColumnHeader(newColumnId as string, focusToken);
        });
      };

      window.addEventListener('pointerup', focusAfterGesture, { once: true });
      window.addEventListener('touchend', focusAfterGesture, { once: true });
    }
  }, [focusColumnHeader, onAddAttribute]);

  return (
    <div className="landing-resizable-textarea landing-resizable-textarea--structured rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="theme-scrollbar landing-participant-columns" style={{ height: `${height}px` }}>
        <div className="landing-participant-columns__surface">
          <div className="landing-participant-columns__columns">
            {columns.map((column, index) => (
              <React.Fragment key={column.id}>
                <div
                  className="landing-participant-columns__column"
                  style={{
                    minWidth: `${index === 0 ? MIN_NAME_WIDTH : MIN_ATTRIBUTE_WIDTH}px`,
                    flex: `0 1 ${getColumnWidth(index)}px`,
                  }}
                  data-column-id={column.id}
                >
                  <div className={index === 0
                    ? 'landing-participant-columns__header-shell landing-participant-columns__header-shell--static'
                    : 'landing-participant-columns__header-shell landing-participant-columns__header-shell--interactive'}>
                    <div className="landing-participant-columns__column-header">
                      {index === 0 ? (
                        <div className="landing-participant-columns__header-label landing-participant-columns__header-text">{nameColumnLabel}</div>
                      ) : (
                        <div className="landing-participant-columns__header-editor-row">
                          <EditableTextBlock
                            value={column.name}
                            onChange={(nextValue) => onChangeColumnName(index, nextValue)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                              }
                            }}
                            className="landing-participant-columns__header-input landing-participant-columns__header-text"
                            ariaLabel={`Attribute column ${index}`}
                            placeholder={attributeNamePlaceholder}
                            inputRef={(node) => registerHeaderInput(column.id, node)}
                            dataFocusTarget
                            focusToken={pendingFocusRequest?.columnId === column.id ? pendingFocusRequest.token : null}
                          />
                          <button
                            type="button"
                            className="landing-participant-columns__remove-button"
                            onClick={() => onRemoveAttribute(index)}
                            aria-label={`${removeAttributeLabel}: ${column.name || `Attribute ${index}`}`}
                            title={removeAttributeLabel}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="landing-participant-columns__body-shell">
                    <EditableTextBlock
                      value={column.values}
                      onChange={(nextValue) => onChangeColumnValues(index, nextValue)}
                      ariaLabel={index === 0 ? label : column.name || `Attribute ${index}`}
                      className="landing-participant-columns__textarea"
                      style={{ height: `${contentHeight}px` }}
                      multiline
                      placeholder={index === 0 ? nameColumnPlaceholder : ''}
                    />
                  </div>
                </div>

                {index < columns.length - 1 && (
                  <div
                    className="landing-participant-columns__separator"
                    onPointerDown={(event) => startColumnResize(index, event)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize column ${index + 1}`}
                  >
                    <div className="landing-participant-columns__separator-line" />
                  </div>
                )}
              </React.Fragment>
            ))}

            <div
              className="landing-participant-columns__separator"
              onPointerDown={(event) => startColumnResize(columns.length - 1, event)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize ghost column"
            >
              <div className="landing-participant-columns__separator-line" />
            </div>

            <div
              className="landing-participant-columns__ghost-column"
              style={{
                minWidth: `${MIN_ATTRIBUTE_WIDTH}px`,
                flex: `1 1 ${ghostColumnWidth}px`,
              }}
              role="button"
              tabIndex={0}
              aria-label={addAttributeLabel}
              onPointerDown={(event) => {
                event.preventDefault();
                lastGhostPointerActivationAtRef.current = Date.now();
                handleActivateGhostColumn();
              }}
              onClick={() => {
                const lastPointerActivationAt = lastGhostPointerActivationAtRef.current;
                if (lastPointerActivationAt != null && Date.now() - lastPointerActivationAt < 750) {
                  return;
                }

                handleActivateGhostColumn();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleActivateGhostColumn();
                }
              }}
            >
              <div className="landing-participant-columns__ghost-header-shell">
                <div className="landing-participant-columns__column-header">
                  <div className="landing-participant-columns__ghost-header-label landing-participant-columns__header-text">{ghostAttributeDisplayLabel}</div>
                </div>
              </div>
              <div className="landing-participant-columns__ghost-body-shell">
                <div className="landing-participant-columns__ghost-textarea" style={{ height: `${contentHeight}px` }}>{ghostAttributeValuesPreview}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className="landing-resizable-textarea__resize-handle"
        onPointerDown={handleResizePointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize input"
      />
    </div>
  );
}
