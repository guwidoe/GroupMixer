import React, { useId, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

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

function getInlineInputWidthCh({
  value,
  draft,
  min,
  max,
  softMax,
  kind,
  step,
}: {
  value: number | null;
  draft: string;
  min?: number;
  max?: number;
  softMax?: number;
  kind: NumberFieldKind;
  step: number;
}) {
  const candidates = [
    draft,
    formatValue(value, kind, step),
    typeof min === 'number' ? formatValue(min, kind, step) : '',
    typeof max === 'number' ? formatValue(max, kind, step) : '',
    typeof softMax === 'number' ? formatValue(softMax, kind, step) : '',
  ];

  const widest = candidates.reduce((maxLength, candidate) => Math.max(maxLength, candidate.length), 0);
  return Math.max(kind === 'float' ? 4 : 3, widest + 1);
}

function getSliderPercent(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }

  return ((clamp(value, min, max) - min) / (max - min)) * 100;
}

function getChipHalfWidthRem(widthCh: number) {
  return Math.max(1.25, (widthCh * 0.32) + 0.55);
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
  const labelText = typeof label === 'string' ? label : 'value';
  const inlineInputWidthCh = useMemo(
    () => getInlineInputWidthCh({
      value,
      draft,
      min,
      max,
      softMax: effectiveSoftMax,
      kind,
      step,
    }),
    [draft, effectiveSoftMax, kind, max, min, step, value],
  );
  const sliderPercent = sliderEnabled && typeof sliderValue === 'number' && typeof effectiveSoftMax === 'number'
    ? getSliderPercent(sliderValue, sliderMin, effectiveSoftMax)
    : 0;
  const chipHalfWidthRem = useMemo(() => getChipHalfWidthRem(inlineInputWidthCh), [inlineInputWidthCh]);

  React.useEffect(() => {
    if (!isFocused) {
      setDraft(formatValue(value, kind, step));
    }
  }, [isFocused, kind, step, value]);

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

  const inputElement = (
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
      className={['number-field__input', inputClassName, isInvalid ? 'number-field__input--invalid' : null].filter(Boolean).join(' ')}
      style={sliderEnabled ? { width: `${inlineInputWidthCh}ch` } : undefined}
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
  );

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
          <div className="number-field__slider-row">
            <button
              type="button"
              className="number-field__stepper"
              onClick={() => adjustValue(-step)}
              disabled={disabled || (typeof min === 'number' && (value ?? sliderMin) <= min)}
              aria-label={`Decrease ${labelText}`}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

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
                }}
                onMouseUp={(event) => {
                  const next = normalizeNumber(Number((event.currentTarget as HTMLInputElement).value), { kind, step, min: sliderMin, max: effectiveSoftMax });
                  onCommit?.(next);
                }}
                onTouchEnd={(event) => {
                  const next = normalizeNumber(Number((event.currentTarget as HTMLInputElement).value), { kind, step, min: sliderMin, max: effectiveSoftMax });
                  onCommit?.(next);
                }}
              />

              {showInput ? (
                <div className="number-field__value-chip-track">
                  <div
                    className="number-field__value-chip-anchor"
                    style={{
                      '--number-field-chip-position': `${sliderPercent}%`,
                      '--number-field-chip-half-width': `${chipHalfWidthRem}rem`,
                    } as React.CSSProperties}
                  >
                    <div
                      className={[
                        'number-field__input-shell',
                        'number-field__input-shell--chip',
                        isInvalid ? 'number-field__input-shell--invalid' : null,
                      ].filter(Boolean).join(' ')}
                    >
                      {inputElement}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="number-field__stepper"
              onClick={() => adjustValue(step)}
              disabled={disabled || (typeof max === 'number' && (value ?? sliderMin) >= max)}
              aria-label={`Increase ${labelText}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {showInput && !sliderEnabled ? (
          <div
            className={[
              'number-field__input-shell',
              isInvalid ? 'number-field__input-shell--invalid' : null,
            ].filter(Boolean).join(' ')}
          >
            {inputElement}
          </div>
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
