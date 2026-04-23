import React, { useId, useMemo, useState } from 'react';

export type NumberFieldKind = 'int' | 'float';
export type NumberFieldVariant = 'default' | 'compact';

export interface NumberFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  onCommit?: (value: number | null) => void;
  id?: string;
  name?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  min?: number;
  softMax?: number;
  max?: number;
  step?: number;
  largeStep?: number;
  kind?: NumberFieldKind;
  allowEmpty?: boolean;
  disabled?: boolean;
  required?: boolean;
  variant?: NumberFieldVariant;
  showSlider?: boolean;
  showInput?: boolean;
  className?: string;
  inputClassName?: string;
  inputAriaLabel?: string;
  sliderAriaLabel?: string;
}

function clamp(value: number, min?: number, max?: number) {
  let next = value;
  if (typeof min === 'number') {
    next = Math.max(min, next);
  }
  if (typeof max === 'number') {
    next = Math.min(max, next);
  }
  return next;
}

function inferDecimals(step?: number) {
  if (step == null) return 2;
  const text = String(step);
  const index = text.indexOf('.');
  return index === -1 ? 0 : text.length - index - 1;
}

function roundToStep(value: number, step: number, min = 0, kind: NumberFieldKind = 'int') {
  if (!Number.isFinite(value)) return value;
  const rounded = min + Math.round((value - min) / step) * step;
  if (kind === 'int') {
    return Math.round(rounded);
  }
  const decimals = inferDecimals(step);
  return Number(rounded.toFixed(Math.max(decimals, 2)));
}

function formatValue(value: number | null, kind: NumberFieldKind, step?: number) {
  if (value == null || Number.isNaN(value)) return '';
  if (kind === 'int') return String(Math.round(value));
  const decimals = Math.max(inferDecimals(step), 0);
  const text = decimals > 0 ? value.toFixed(decimals) : String(value);
  return text.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function parseDraft(raw: string, kind: NumberFieldKind) {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed === '-' || trimmed === '.' || trimmed === '-.') return Number.NaN;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) return Number.NaN;
  return kind === 'int' ? Math.round(parsed) : parsed;
}

function normalizeNumber(value: number, {
  kind,
  step,
  min,
  max,
}: {
  kind: NumberFieldKind;
  step: number;
  min?: number;
  max?: number;
}) {
  const bounded = clamp(value, min, max);
  return roundToStep(bounded, step, min ?? 0, kind);
}

function getSliderPercent(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }

  return ((clamp(value, min, max) - min) / (max - min)) * 100;
}

function getSliderLabelOffsetRem(percent: number) {
  const thumbRadiusRem = 1.05 / 2;
  const normalizedPercent = clamp(percent, 0, 100) / 100;
  return thumbRadiusRem * (1 - (2 * normalizedPercent));
}

export function NumberField({
  value,
  onChange,
  onCommit,
  id,
  name,
  label,
  hint,
  error,
  min,
  softMax,
  max,
  step = 1,
  largeStep,
  kind = 'int',
  allowEmpty = false,
  disabled = false,
  required = false,
  variant = 'default',
  showSlider = true,
  showInput = true,
  className,
  inputClassName,
  inputAriaLabel,
  sliderAriaLabel,
}: NumberFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `number-field-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const [draft, setDraft] = useState(() => formatValue(value, kind, step));
  const [isFocused, setIsFocused] = useState(false);
  const [isSliderFocused, setIsSliderFocused] = useState(false);
  const [sliderTypingBuffer, setSliderTypingBuffer] = useState<string | null>(null);
  const [sliderTypingSelected, setSliderTypingSelected] = useState(false);
  const displayValue = isFocused ? draft : formatValue(value, kind, step);

  const parsedDraft = useMemo(() => parseDraft(draft, kind), [draft, kind]);
  const hasParseError = draft.trim() !== '' && Number.isNaN(parsedDraft);
  const hasRangeError = parsedDraft !== null && !Number.isNaN(parsedDraft)
    && ((typeof min === 'number' && parsedDraft < min) || (typeof max === 'number' && parsedDraft > max));
  const isInvalid = Boolean(error) || hasParseError || hasRangeError;
  const effectiveLargeStep = largeStep ?? step * 10;
  const sliderMin = typeof min === 'number' ? min : 0;
  const effectiveSoftMax = softMax ?? max;
  const sliderEnabled = showSlider && variant !== 'compact' && typeof effectiveSoftMax === 'number';
  const sliderValue = sliderEnabled
    ? clamp(value ?? sliderMin, sliderMin, effectiveSoftMax)
    : undefined;
  const isOverflowing = sliderEnabled && typeof effectiveSoftMax === 'number' && value != null && value > effectiveSoftMax;
  const sliderPercent = sliderEnabled && typeof sliderValue === 'number' && typeof effectiveSoftMax === 'number'
    ? getSliderPercent(sliderValue, sliderMin, effectiveSoftMax)
    : 0;
  const sliderLabelOffsetRem = getSliderLabelOffsetRem(sliderPercent);
  const sliderDisplayValue = isSliderFocused && sliderTypingBuffer != null
    ? sliderTypingBuffer
    : formatValue(value ?? sliderValue ?? null, kind, step);

  const clearSliderTypingBuffer = () => {
    setSliderTypingBuffer(null);
    setSliderTypingSelected(false);
  };

  const applySliderTypedValue = (nextRaw: string) => {
    setSliderTypingBuffer(nextRaw);
    setSliderTypingSelected(false);

    const parsed = parseDraft(nextRaw, kind);
    if (parsed === null || Number.isNaN(parsed)) {
      return;
    }

    const normalized = normalizeNumber(parsed, { kind, step, min, max });
    onChange(normalized);
    setDraft(formatValue(normalized, kind, step));
  };

  const commitDraft = () => {
    if (disabled) return;
    if (draft.trim() === '') {
      if (allowEmpty) {
        onChange(null);
        onCommit?.(null);
        setDraft('');
      } else {
        setDraft(formatValue(value, kind, step));
      }
      return;
    }

    if (parsedDraft === null || Number.isNaN(parsedDraft) || hasRangeError) {
      setDraft(formatValue(value, kind, step));
      return;
    }

    const normalized = normalizeNumber(parsedDraft, { kind, step, min, max });
    onChange(normalized);
    onCommit?.(normalized);
    setDraft(formatValue(normalized, kind, step));
  };

  const adjustValue = (delta: number) => {
    const baseline = parsedDraft !== null && !Number.isNaN(parsedDraft)
      ? parsedDraft
      : value ?? min ?? 0;
    const normalized = normalizeNumber(baseline + delta, { kind, step, min, max });
    onChange(normalized);
    onCommit?.(normalized);
    setDraft(formatValue(normalized, kind, step));
  };

  return (
    <div className={['number-field', `number-field--${variant}`, disabled ? 'number-field--disabled' : null, className].filter(Boolean).join(' ')}>
      {label ? (
        <label htmlFor={showInput ? inputId : undefined} className="number-field__label">
          {label}
          {required ? ' *' : null}
        </label>
      ) : null}

      <div className="number-field__controls">
        {sliderEnabled ? (
          <div className="number-field__slider-column">
            <input
              type="range"
              min={sliderMin}
              max={effectiveSoftMax}
              step={step}
              value={sliderValue}
              disabled={disabled}
              aria-label={sliderAriaLabel ?? (typeof label === 'string' ? `${label} slider` : 'Numeric slider')}
              className={['number-field__slider', isOverflowing ? 'number-field__slider--overflow' : null].filter(Boolean).join(' ')}
              onChange={(event) => {
                const next = normalizeNumber(Number(event.target.value), { kind, step, min: sliderMin, max: effectiveSoftMax });
                onChange(next);
                setDraft(formatValue(next, kind, step));
                setSliderTypingBuffer(formatValue(next, kind, step));
                setSliderTypingSelected(true);
              }}
              onMouseUp={(event) => {
                const next = normalizeNumber(Number((event.currentTarget as HTMLInputElement).value), { kind, step, min: sliderMin, max: effectiveSoftMax });
                onCommit?.(next);
              }}
              onTouchEnd={(event) => {
                const next = normalizeNumber(Number((event.currentTarget as HTMLInputElement).value), { kind, step, min: sliderMin, max: effectiveSoftMax });
                onCommit?.(next);
              }}
              onFocus={() => {
                setIsSliderFocused(true);
                setSliderTypingBuffer(formatValue(value ?? sliderValue ?? null, kind, step));
                setSliderTypingSelected(true);
              }}
              onBlur={() => {
                setIsSliderFocused(false);
                clearSliderTypingBuffer();
              }}
              onKeyDown={(event) => {
                const isDigit = /^\d$/.test(event.key);
                const isDecimalPoint = kind === 'float' && event.key === '.';
                const isLeadingMinus = event.key === '-' && (min == null || min < 0);

                if (isDigit || isDecimalPoint || isLeadingMinus) {
                  event.preventDefault();
                  const nextRaw = sliderTypingSelected
                    ? event.key
                    : `${sliderTypingBuffer ?? ''}${event.key}`;
                  applySliderTypedValue(nextRaw);
                  return;
                }

                if (event.key === 'Backspace') {
                  event.preventDefault();
                  const nextRaw = (sliderTypingBuffer ?? formatValue(value ?? sliderValue ?? null, kind, step)).slice(0, -1);
                  setSliderTypingSelected(false);
                  setSliderTypingBuffer(nextRaw);
                  if (nextRaw === '') {
                    return;
                  }
                  applySliderTypedValue(nextRaw);
                  return;
                }

                if (event.key === 'Escape') {
                  clearSliderTypingBuffer();
                  setSliderTypingBuffer(formatValue(value ?? sliderValue ?? null, kind, step));
                  setSliderTypingSelected(true);
                }
              }}
            />
            {showInput ? (
              <div className="number-field__slider-value-track" aria-hidden="true">
                <span
                  className={[
                    'number-field__slider-value',
                    isSliderFocused ? 'number-field__slider-value--focused' : null,
                  ].filter(Boolean).join(' ')}
                  style={{
                    '--number-field-slider-value-position': `${sliderPercent}%`,
                    '--number-field-slider-value-offset': `${sliderLabelOffsetRem}rem`,
                  } as React.CSSProperties}
                >
                  {sliderDisplayValue}
                  {isSliderFocused ? <span className="number-field__slider-value-caret" /> : null}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {showInput && !sliderEnabled ? (
          <input
            id={inputId}
            name={name}
            type="text"
            inputMode={kind === 'int' ? 'numeric' : 'decimal'}
            value={displayValue}
            disabled={disabled}
            aria-label={inputAriaLabel}
            aria-invalid={isInvalid || undefined}
            aria-describedby={describedBy}
            className={['input number-field__input', inputClassName, isInvalid ? 'number-field__input--invalid border-red-500 focus:border-red-500' : null].filter(Boolean).join(' ')}
            onFocus={() => {
              setDraft(formatValue(value, kind, step));
              setIsFocused(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              commitDraft();
            }}
            onChange={(event) => {
              const nextRaw = event.target.value;
              setDraft(nextRaw);
              if (nextRaw.trim() === '') {
                if (allowEmpty) {
                  onChange(null);
                }
                return;
              }
              const parsed = parseDraft(nextRaw, kind);
              if (parsed === null || Number.isNaN(parsed)) {
                return;
              }
              if ((typeof min === 'number' && parsed < min) || (typeof max === 'number' && parsed > max)) {
                return;
              }
              onChange(normalizeNumber(parsed, { kind, step, min, max }));
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                adjustValue(event.shiftKey ? effectiveLargeStep : step);
                return;
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                adjustValue(-(event.shiftKey ? effectiveLargeStep : step));
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(formatValue(value, kind, step));
                setIsFocused(false);
              }
            }}
          />
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="number-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="number-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default NumberField;
