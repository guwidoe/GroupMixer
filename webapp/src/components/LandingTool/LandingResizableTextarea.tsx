import React, { useCallback, useEffect, useRef, useState } from 'react';

interface LandingResizableTextareaProps {
  id?: string;
  ariaLabel?: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight: number;
  className?: string;
  style?: React.CSSProperties;
  textareaClassName?: string;
}

export function LandingResizableTextarea({
  id,
  ariaLabel,
  value,
  onChange,
  placeholder,
  readOnly = false,
  minHeight,
  className,
  style,
  textareaClassName,
}: LandingResizableTextareaProps) {
  const [height, setHeight] = useState(minHeight);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const nextHeight = Math.max(minHeight, dragState.startHeight + (event.clientY - dragState.startY));
    setHeight(nextHeight);
  }, [minHeight]);

  const stopResize = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  }, [handlePointerMove]);

  useEffect(() => stopResize, [stopResize]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStateRef.current = {
      startY: event.clientY,
      startHeight: height,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }, [handlePointerMove, height, stopResize]);

  return (
    <div
      className={['landing-resizable-textarea', className].filter(Boolean).join(' ')}
      style={style}
    >
      <textarea
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        className={['theme-scrollbar landing-resizable-textarea__field', textareaClassName].filter(Boolean).join(' ')}
        style={{ height: `${height}px` }}
      />
      <div
        className="landing-resizable-textarea__resize-handle"
        onPointerDown={handlePointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize text area"
      />
    </div>
  );
}
